/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setActiveTabLabel,
  setSearchInput,
  commitSearch,
  clearSearch,
  setPage,
  setDatePreset,
  commitCustomRange,
  clearDateFilter,
  ORDER_TAB_LABEL_TO_BUCKET,
  DEFAULT_ORDER_TAB_LABEL,
  isOrdersDateFilterActive,
  selectAdminOrdersListQueryArgs,
  selectAdminOrdersSummaryQueryArgs,
  selectAdminOrdersDateQueryArgs,
} from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
import {
  useGetAdminOrdersSummaryQuery,
  useGetAdminOrdersListQuery,
  useAdminAutoSyncOrderStatusesMutation,
  useGetAdminOrderDetailQuery,
  useGetAdminOrderTrackingQuery,
  useAdminBulkApprovalCancelMutation,
  useAdminBulkApprovalConfirmMutation,
  useAdminBulkFulfillmentShipNowMutation,
  useAdminBulkFulfillmentSchedulePickupMutation,
  useAdminBulkFulfillmentSyncShiprocketMutation,
  useGetAdminPickupCalendarQuery,
} from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersApi";
import { isPostConfirmOrderStatus } from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
import {
  canAdminBulkCancelOrderRow,
  canAdminBulkConfirmOrderRow,
  canAdminBulkDownloadLabelOrderRow,
  canAdminBulkDownloadManifestOrderRow,
  canAdminBulkSchedulePickupOrderRow,
  canAdminBulkShipNowOrderRow,
  canAdminBulkSyncShiprocketOrderRow,
} from "../../../../utils/adminOrderFulfillmentEligibility";
import AdminOrderDetailView from "./AdminOrderDetailView";
import AdminOrderRowActions from "./AdminOrderRowActions";
import wholesaleAxios from "../../../../SERVICES/Wholesaleaxios";
import { useSearchParams } from "react-router-dom";

const TAB_ORDER = [
  // "All" — intentionally hidden; summary cards still exclude cancelled via backend totals.
  "Pending",
  "Confirmed",
  "Ready to Ship",
  "Processing",
  "In transit",
  "Delivered",
  "RTO",
  "Cancelled",
  "Pickup Exception",
];

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Local calendar YYYY-MM-DD */
function toLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLocalDaysYmd(days) {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return toLocalYmd(t);
}

function mutationErrorToString(err) {
  if (!err) return "Request failed.";
  const d = err.data;
  if (typeof d === "object" && d && d.message) return String(d.message);
  if (typeof d === "string") return d;
  return err.message || "Request failed.";
}

async function messageFromMaybeErrorBlob(blob) {
  if (!(blob instanceof Blob)) return "Request failed.";
  try {
    const text = await blob.text();
    const j = JSON.parse(text);
    if (j && typeof j === "object" && j.message) return String(j.message);
    if (j && typeof j === "object" && j.code) return String(j.code);
    return text.slice(0, 500) || "Request failed.";
  } catch {
    return "Request failed.";
  }
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ApiErrorBanner({ error }) {
  if (!error) return null;
  const msg =
    error?.data?.message ||
    error?.message ||
    (typeof error?.data === "string" ? error.data : null) ||
    "Something went wrong while loading orders.";
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {msg}
    </div>
  );
}

const OrderTab = () => {
  const dispatch = useDispatch();
  const listArgs = useSelector(selectAdminOrdersListQueryArgs);
  const summaryArgs = useSelector(selectAdminOrdersSummaryQueryArgs);
  const dateArgs = useSelector(selectAdminOrdersDateQueryArgs);
  const ui = useSelector((s) => s.adminOrdersUi);
  const dateFilterActive = isOrdersDateFilterActive(ui.datePreset);
  const searchActive = Boolean(String(ui.search || "").trim());

  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    if (selectedOrderId) {
      window.history.pushState({ orderDetail: true }, '');
    }
  }, [selectedOrderId]);

  useEffect(() => {
    const handlePopState = () => {
      if (selectedOrderId) {
        setSelectedOrderId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedOrderId]);

  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab");

  const {
    data: summaryRes,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    error: summaryError,
    isError: summaryIsError,
    refetch: refetchSummary,
  } = useGetAdminOrdersSummaryQuery(summaryArgs);

  const {
    data: listRes,
    isLoading: listLoading,
    isFetching: listFetching,
    error: listError,
    isError: listIsError,
    refetch: refetchList,
  } = useGetAdminOrdersListQuery(listArgs);

  const [autoSyncOrderStatuses] = useAdminAutoSyncOrderStatusesMutation();
  const autoSyncBusyRef = useRef(false);

  /** Silent background sync: Shiprocket + Shipmozo → DB for stale orders in the active date range. */
  useEffect(() => {
    let cancelled = false;
    let initialTimer;
    let intervalId;

    const runAutoSync = async () => {
      if (cancelled || autoSyncBusyRef.current || document.hidden) return;
      autoSyncBusyRef.current = true;
      try {
        let complete = false;
        let guard = 0;
        while (!cancelled && !complete && guard < 20) {
          guard += 1;
          const result = await autoSyncOrderStatuses(dateArgs).unwrap();
          complete = Boolean(result?.data?.summary?.complete);
          const remaining = result?.data?.summary?.remainingStale ?? 0;
          const timedOut = Boolean(result?.data?.summary?.timedOut);
          if (complete || remaining <= 0 || !timedOut) break;
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {
        /* background sync — no user-facing error */
      } finally {
        autoSyncBusyRef.current = false;
      }
    };

    initialTimer = setTimeout(runAutoSync, 4000);
    intervalId = setInterval(runAutoSync, 90_000);

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        runAutoSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dateArgs, autoSyncOrderStatuses]);

  const {
    data: detailRes,
    isLoading: detailLoading,
    error: detailError,
    isError: detailIsError,
    refetch: refetchOrderDetail,
  } = useGetAdminOrderDetailQuery(selectedOrderId, {
    skip: !selectedOrderId,
  });

  const {
    data: trackingRes,
    isLoading: trackingLoading,
    isFetching: trackingFetching,
    error: trackingError,
    isError: trackingIsError,
    refetch: refetchTracking,
  } = useGetAdminOrderTrackingQuery(selectedOrderId, {
    skip: !selectedOrderId,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    pollingInterval: selectedOrderId ? 30000 : 0,
  });

  const summary = summaryRes?.data;
  const listPayload = listRes?.data;
  const orders = listPayload?.orders ?? [];
  const pagination = listPayload?.pagination;
  const detailOrder = detailRes?.order;
  const fulfillmentPaymentGate = detailRes?.fulfillmentPaymentGate;
  const tracking = trackingRes?.tracking || null;

  const [selectedOrders, setSelectedOrders] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkPickupPanelOpen, setBulkPickupPanelOpen] = useState(false);
  const [bulkPickupDate, setBulkPickupDate] = useState("");
  const { data: bulkPickupCalendarRes } = useGetAdminPickupCalendarQuery(
    { daysAhead: 45 },
    { skip: !bulkPickupPanelOpen }
  );
  const bulkPickupAllowedDates = useMemo(
    () =>
      Array.isArray(bulkPickupCalendarRes?.calendar?.allowedDates)
        ? bulkPickupCalendarRes.calendar.allowedDates
        : [],
    [bulkPickupCalendarRes?.calendar?.allowedDates]
  );
  const [bulkInlineError, setBulkInlineError] = useState(null);

  useEffect(() => {
    if (!bulkPickupPanelOpen) return;
    const def = bulkPickupCalendarRes?.calendar?.defaultDate;
    if (def && bulkPickupAllowedDates.includes(def)) {
      setBulkPickupDate(def);
    }
  }, [bulkPickupPanelOpen, bulkPickupCalendarRes?.calendar?.defaultDate, bulkPickupAllowedDates]);
  const [bulkFeedback, setBulkFeedback] = useState(null);

  const [bulkConfirm, bulkConfirmState] = useAdminBulkApprovalConfirmMutation();
  const [bulkCancel, bulkCancelState] = useAdminBulkApprovalCancelMutation();
  const [bulkShipNow, bulkShipNowState] = useAdminBulkFulfillmentShipNowMutation();
  const [bulkSchedulePickup, bulkSchedulePickupState] = useAdminBulkFulfillmentSchedulePickupMutation();
  const [bulkSyncShiprocket, bulkSyncShiprocketState] = useAdminBulkFulfillmentSyncShiprocketMutation();
  const bulkBusy =
    bulkConfirmState.isLoading ||
    bulkCancelState.isLoading ||
    bulkShipNowState.isLoading ||
    bulkSchedulePickupState.isLoading ||
    bulkSyncShiprocketState.isLoading;
  const [bulkZipBusy, setBulkZipBusy] = useState(false);
  const [bulkInvoiceAwbModalOpen, setBulkInvoiceAwbModalOpen] = useState(false);
  const [rowActionFeedback, setRowActionFeedback] = useState(null);
  const bulkActionsBusy = bulkBusy || bulkZipBusy;

  const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);

  const eligibleBulkInvoiceIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        if (!o) return false;
        return isPostConfirmOrderStatus(o.orderStatus);
      }),
    [selectedOrders, orderById]
  );

  const eligibleBulkLabelIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkDownloadLabelOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  const eligibleBulkManifestIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkDownloadManifestOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  const invoiceSelectionMissingAwb = useMemo(
    () => eligibleBulkInvoiceIds.filter((id) => !orderById.get(id)?.hasAwb).length,
    [eligibleBulkInvoiceIds, orderById]
  );

  const showBulkTaxInvoicesZip = dateFilterActive || ui.activeTabLabel === "Confirmed";
  const showBulkFulfillmentActions = selectedOrders.length > 0;

  /** Any pending row — cancel does not require payment capture. */
  const eligibleBulkPendingIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkCancelOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  /** Pending + same payment gate as order detail Confirm (from list API `canConfirmForFulfillment`). */
  const eligibleBulkConfirmIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkConfirmOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  const showBulkPendingActions = dateFilterActive || ui.activeTabLabel === "Pending";

  const eligibleBulkShipIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkShipNowOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  const eligibleBulkPickupIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkSchedulePickupOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  const eligibleBulkSyncIds = useMemo(
    () =>
      selectedOrders.filter((id) => {
        const o = orderById.get(id);
        return canAdminBulkSyncShiprocketOrderRow(o);
      }),
    [selectedOrders, orderById]
  );

  useEffect(() => {
    setSelectedOrders([]);
    setShowBulkMenu(false);
    setBulkPickupPanelOpen(false);
    setBulkInlineError(null);
    setBulkFeedback(null);
    setBulkInvoiceAwbModalOpen(false);
    setBulkZipBusy(false);
  }, [ui.page, ui.activeTabLabel, ui.search, ui.datePreset, ui.customDateFrom, ui.customDateTo]);

  useEffect(() => {
    setSelectedOrderId(null);
  }, [activeTab]);

  /** Legacy "All" tab removed from UI — normalize any stale Redux state once. */
  useEffect(() => {
    if (ui.activeTabLabel === "All") {
      dispatch(setActiveTabLabel(DEFAULT_ORDER_TAB_LABEL));
    }
  }, [ui.activeTabLabel, dispatch]);

  /** Draft dates for Custom range — committed via Apply only */
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [customRangeError, setCustomRangeError] = useState(null);

  const searchDebounceBoot = useRef(true);
  /** Debounced search: commit 500ms after user stops typing (skip first paint) */
  useEffect(() => {
    if (searchDebounceBoot.current) {
      searchDebounceBoot.current = false;
      return undefined;
    }
    const t = setTimeout(() => {
      dispatch(commitSearch());
    }, 500);
    return () => clearTimeout(t);
  }, [ui.searchInput, dispatch]);

  const stats = useMemo(() => {
    const t = summary?.totals;
    if (!t) {
      return [
        { label: "Total orders", value: "—" },
        { label: "Total revenue", value: "—" },
        { label: "Total pending orders", value: "—" },
        { label: "Total completed orders", value: "—" },
      ];
    }
    return [
      { label: "Total orders", value: String(t.totalOrders ?? 0) },
      { label: "Total revenue", value: formatInr(t.totalRevenueInr) },
      { label: "Total pending orders", value: String(t.totalPendingOrders ?? 0) },
      { label: "Total completed orders", value: String(t.totalCompletedOrders ?? 0) },
    ];
  }, [summary]);

  const filters = useMemo(() => {
    const c = summary?.countsByBucket || {};
    return TAB_ORDER.map((label) => {
      const key = ORDER_TAB_LABEL_TO_BUCKET[label];
      return { label, count: c[key] ?? 0 };
    });
  }, [summary]);

  const handleDownloadReport = useCallback(() => {
    const rows = orders.map((o) => ({
      id: o.orderIdDisplay || o.orderId,
      contact: o.contactPhone || "",
      date: formatDateTime(o.createdAt),
      amount: formatInr(o.amountInr),
      status: o.fulfillmentLabel || "",
      items: o.itemCount,
      payment: o.paymentLabel || "",
    }));
    const header = "Order ID,Contact,Date,Amount,Status,Items,Payment";
    const csvContent =
      "data:text/csv;charset=utf-8," +
      header +
      "\n" +
      rows
        .map((o) =>
          [o.id, o.contact, o.date, o.amount, o.status, o.items, o.payment]
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Orders_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [orders]);

  const handleBulkCancel = useCallback(async () => {
    setBulkInlineError(null);
    setBulkFeedback(null);
    if (!eligibleBulkPendingIds.length) {
      setBulkInlineError("No eligible orders. Cancel applies to Pending orders only.");
      return;
    }
    if (
      !window.confirm(
        `Cancel ${eligibleBulkPendingIds.length} pending order(s)? Stock will be restored for each.`
      )
    ) {
      return;
    }
    try {
      const data = await bulkCancel({ orderIds: eligibleBulkPendingIds }).unwrap();
      setBulkFeedback({
        kind: "cancel",
        summary: data.summary,
        results: data.results || [],
        extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkPendingIds.length),
      });
      setShowBulkMenu(false);
    } catch (err) {
      setBulkInlineError(mutationErrorToString(err));
    }
  }, [bulkCancel, eligibleBulkPendingIds, selectedOrders.length]);

  const handleBulkConfirm = useCallback(async () => {
    setBulkInlineError(null);
    setBulkFeedback(null);
    if (!eligibleBulkConfirmIds.length) {
      setBulkInlineError(
        "No eligible orders. Confirm applies to Pending orders with payment ready (COD or paid online)."
      );
      return;
    }
    try {
      const data = await bulkConfirm({ orderIds: eligibleBulkConfirmIds }).unwrap();
      setBulkFeedback({
        kind: "confirm",
        summary: data.summary,
        results: data.results || [],
        extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkConfirmIds.length),
      });
      setShowBulkMenu(false);
    } catch (err) {
      setBulkInlineError(mutationErrorToString(err));
    }
  }, [bulkConfirm, eligibleBulkConfirmIds, selectedOrders.length]);

  const handleBulkShipNow = useCallback(async () => {
    setBulkInlineError(null);
    setBulkFeedback(null);
    if (!eligibleBulkShipIds.length) {
      setBulkInlineError(
        "No eligible orders in the selection. Bulk ship needs Confirmed orders without an AWB yet."
      );
      return;
    }
    try {
      const data = await bulkShipNow({ orderIds: eligibleBulkShipIds }).unwrap();
      setBulkFeedback({
        kind: "ship",
        summary: data.summary,
        results: data.results || [],
        extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkShipIds.length),
      });
      setShowBulkMenu(false);
    } catch (err) {
      setBulkInlineError(mutationErrorToString(err));
    }
  }, [bulkShipNow, eligibleBulkShipIds, selectedOrders.length]);

  const handleBulkSchedulePickupRun = useCallback(async () => {
    setBulkInlineError(null);
    setBulkFeedback(null);
    const ymd = String(bulkPickupDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setBulkInlineError("Choose a valid pickup date (YYYY-MM-DD).");
      return;
    }
    if (!eligibleBulkPickupIds.length) {
      setBulkInlineError(
        "No eligible orders. Pickup scheduling needs an AWB and no pickup date set yet (Confirmed or Processing)."
      );
      return;
    }
    try {
      const data = await bulkSchedulePickup({
        orderIds: eligibleBulkPickupIds,
        pickupDate: ymd,
      }).unwrap();
      setBulkFeedback({
        kind: "pickup",
        summary: data.summary,
        results: data.results || [],
        extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkPickupIds.length),
      });
      setShowBulkMenu(false);
      setBulkPickupPanelOpen(false);
    } catch (err) {
      setBulkInlineError(mutationErrorToString(err));
    }
  }, [
    bulkPickupDate,
    bulkSchedulePickup,
    eligibleBulkPickupIds,
    selectedOrders.length,
  ]);

  const handleBulkSyncShiprocket = useCallback(async () => {
    setBulkInlineError(null);
    setBulkFeedback(null);
    if (!eligibleBulkSyncIds.length) {
      setBulkInlineError("No eligible orders. Refresh Shiprocket needs a Shiprocket shipment on the order.");
      return;
    }
    if (
      !window.confirm(
        `Refresh Shiprocket for ${eligibleBulkSyncIds.length} order(s)? This syncs status and pickup ID (SRPID).`
      )
    ) {
      return;
    }
    try {
      const data = await bulkSyncShiprocket({ orderIds: eligibleBulkSyncIds }).unwrap();
      setBulkFeedback({
        kind: "sync",
        summary: data.summary,
        results: data.results || [],
        extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkSyncIds.length),
      });
      setShowBulkMenu(false);
    } catch (err) {
      setBulkInlineError(mutationErrorToString(err));
    }
  }, [bulkSyncShiprocket, eligibleBulkSyncIds, selectedOrders.length]);

  const openBulkPickupPanel = useCallback(() => {
    setBulkInlineError(null);
    setBulkPickupDate((d) => d || addLocalDaysYmd(1));
    setBulkPickupPanelOpen(true);
    setShowBulkMenu(false);
  }, []);

  const runBulkTaxInvoicesZipDownload = useCallback(async () => {
    if (!eligibleBulkInvoiceIds.length) {
      setBulkInlineError(
        "No eligible orders for bulk tax invoices. Cancelled and payment-failed rows are excluded."
      );
      return;
    }
    setBulkInlineError(null);
    setBulkInvoiceAwbModalOpen(false);
    setBulkZipBusy(true);
    try {
      const res = await wholesaleAxios.post(
        "/orders/admin/items/bulk-documents/tax-invoices-zip",
        { orderIds: eligibleBulkInvoiceIds, concurrency: 4 },
        { responseType: "blob", timeout: 180000 }
      );
      const blob = res.data;
      const ct = String(res.headers["content-type"] || "");
      if (ct.includes("application/json")) {
        const msg = await messageFromMaybeErrorBlob(blob);
        throw new Error(msg);
      }
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("Unexpected empty response from server.");
      }
      downloadBlobFile(blob, `tax-invoices-bulk-${Date.now()}.zip`);
      setShowBulkMenu(false);
    } catch (e) {
      const payload = e.response?.data;
      if (payload instanceof Blob) {
        setBulkInlineError(await messageFromMaybeErrorBlob(payload));
      } else {
        setBulkInlineError(e?.message || mutationErrorToString(e));
      }
    } finally {
      setBulkZipBusy(false);
    }
  }, [eligibleBulkInvoiceIds]);

  const handleBulkTaxInvoicesZipRequest = useCallback(() => {
    setBulkInlineError(null);
    if (!eligibleBulkInvoiceIds.length) {
      setBulkInlineError(
        "No eligible orders for bulk tax invoices. Cancelled and payment-failed rows are excluded."
      );
      return;
    }
    if (invoiceSelectionMissingAwb > 0) {
      setBulkInvoiceAwbModalOpen(true);
      return;
    }
    void runBulkTaxInvoicesZipDownload();
  }, [eligibleBulkInvoiceIds, invoiceSelectionMissingAwb, runBulkTaxInvoicesZipDownload]);

  const handleBulkShippingLabelsZip = useCallback(async () => {
    if (!eligibleBulkLabelIds.length) {
      setBulkInlineError(
        "No eligible orders for label ZIP. Each row needs an AWB (use Ship first) and a shipment id. Cancelled / payment-failed rows are excluded."
      );
      return;
    }
    setBulkInlineError(null);
    setBulkZipBusy(true);
    try {
      const res = await wholesaleAxios.post(
        "/orders/admin/items/bulk-documents/shipping-labels-zip",
        { orderIds: eligibleBulkLabelIds, concurrency: 4 },
        { responseType: "blob", timeout: 180000 }
      );
      const blob = res.data;
      const ct = String(res.headers["content-type"] || "");
      if (ct.includes("application/json")) {
        const msg = await messageFromMaybeErrorBlob(blob);
        throw new Error(msg);
      }
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("Unexpected empty response from server.");
      }
      downloadBlobFile(blob, `shipping-labels-bulk-${Date.now()}.zip`);
      setShowBulkMenu(false);
    } catch (e) {
      const payload = e.response?.data;
      if (payload instanceof Blob) {
        setBulkInlineError(await messageFromMaybeErrorBlob(payload));
      } else {
        setBulkInlineError(e?.message || mutationErrorToString(e));
      }
    } finally {
      setBulkZipBusy(false);
    }
  }, [eligibleBulkLabelIds]);

  const handleBulkManifestsZip = useCallback(async () => {
    if (!eligibleBulkManifestIds.length) {
      setBulkInlineError(
        "No eligible orders for manifest ZIP. Each row needs AWB and shipment id (Ship now first)."
      );
      return;
    }
    setBulkInlineError(null);
    setBulkZipBusy(true);
    try {
      const res = await wholesaleAxios.post(
        "/orders/admin/items/bulk-documents/manifests-zip",
        { orderIds: eligibleBulkManifestIds, concurrency: 4 },
        { responseType: "blob", timeout: 180000 }
      );
      const blob = res.data;
      const ct = String(res.headers["content-type"] || "");
      if (ct.includes("application/json")) {
        const msg = await messageFromMaybeErrorBlob(blob);
        throw new Error(msg);
      }
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("Unexpected empty response from server.");
      }
      downloadBlobFile(blob, `shiprocket-manifests-bulk-${Date.now()}.zip`);
      setShowBulkMenu(false);
    } catch (e) {
      const payload = e.response?.data;
      if (payload instanceof Blob) {
        setBulkInlineError(await messageFromMaybeErrorBlob(payload));
      } else {
        setBulkInlineError(e?.message || mutationErrorToString(e));
      }
    } finally {
      setBulkZipBusy(false);
    }
  }, [eligibleBulkManifestIds]);

  const toggleSelectAll = () => {
    const ids = orders.map((o) => o.orderId);
    if (selectedOrders.length === ids.length) setSelectedOrders([]);
    else setSelectedOrders(ids);
  };

  const toggleSelectOrder = (id) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (selectedOrderId) {
    return (
      <AdminOrderDetailView
        orderId={selectedOrderId}
        order={detailOrder}
        fulfillmentPaymentGate={fulfillmentPaymentGate}
        loading={detailLoading}
        error={detailIsError ? detailError : null}
        tracking={tracking}
        trackingLoading={trackingLoading || trackingFetching}
        trackingError={trackingIsError ? trackingError : null}
        onRefreshTracking={() => refetchTracking()}
        onOrderRefresh={() => refetchOrderDetail()}
        onBack={() => setSelectedOrderId(null)}
      />
    );
  }

  return (
    <div className="p-4 space-y-6 bg-[#F8FAFC] min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders</h1>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="bg-white border border-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={ui.datePreset === "none" || !ui.datePreset ? "none" : ui.datePreset}
              disabled={searchActive}
              title={
                searchActive
                  ? "Date range paused while searching — Clear search to filter by date"
                  : undefined
              }
              onChange={(e) => {
                const v = e.target.value;
                setCustomRangeError(null);
                if (v === "none") {
                  dispatch(clearDateFilter());
                  return;
                }
                if (v === "custom") {
                  const toD = new Date();
                  const fromD = new Date(toD.getTime() - 6 * 24 * 60 * 60 * 1000);
                  const toStr = toLocalYmd(toD);
                  const fromStr = toLocalYmd(fromD);
                  setDraftDateFrom(fromStr);
                  setDraftDateTo(toStr);
                  dispatch(commitCustomRange({ from: fromStr, to: toStr }));
                } else {
                  dispatch(setDatePreset(v));
                }
              }}
            >
              <option value="none">All dates</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
            {dateFilterActive && !searchActive && (
              <button
                type="button"
                onClick={() => {
                  setCustomRangeError(null);
                  setDraftDateFrom("");
                  setDraftDateTo("");
                  dispatch(clearDateFilter());
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1.5 rounded-lg border border-blue-200 bg-blue-50"
              >
                Clear filter
              </button>
            )}
            {ui.datePreset === "custom" && !searchActive && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[10px] text-slate-500 uppercase">From</label>
                <input
                  type="date"
                  className="bg-white border border-slate-200 text-xs px-2 py-1 rounded-lg"
                  value={draftDateFrom}
                  onChange={(e) => setDraftDateFrom(e.target.value)}
                />
                <label className="text-[10px] text-slate-500 uppercase">To</label>
                <input
                  type="date"
                  className="bg-white border border-slate-200 text-xs px-2 py-1 rounded-lg"
                  value={draftDateTo}
                  onChange={(e) => setDraftDateTo(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomRangeError(null);
                    if (!draftDateFrom || !draftDateTo) {
                      setCustomRangeError("Select both start and end dates.");
                      return;
                    }
                    if (draftDateFrom > draftDateTo) {
                      setCustomRangeError("Start date must be on or before end date.");
                      return;
                    }
                    const start = new Date(draftDateFrom);
                    const end = new Date(draftDateTo);
                    const maxMs = 366 * 24 * 60 * 60 * 1000;
                    if (end - start > maxMs) {
                      setCustomRangeError("Range cannot exceed 366 days.");
                      return;
                    }
                    dispatch(commitCustomRange({ from: draftDateFrom, to: draftDateTo }));
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
          </div>
          {customRangeError && <p className="text-xs text-red-600">{customRangeError}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={!orders.length}
            className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            Order report
          </button>
          <button
            type="button"
            className="px-4 py-2 text-xs text-white bg-[#2563eb] rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 opacity-60 cursor-not-allowed"
            title="Coming soon"
            disabled
          >
            Create a manual order
          </button>
        </div>
      </div>

      {(summaryIsError || listIsError) && (
        <ApiErrorBanner error={summaryError || listError} />
      )}

      {/* ── Stats grid — 2 cols on mobile, 4 on desktop ─────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              {stat.label}
            </span>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-1">
              {summaryLoading && !summary ? "…" : stat.value}
            </h3>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* ── Filter tabs + search ─────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row items-center justify-between p-2 gap-4 border-b border-slate-100">
          <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto">
            {filters.map((f) => (
              <button
                type="button"
                key={f.label}
                disabled={dateFilterActive && !searchActive}
                title={
                  dateFilterActive && !searchActive
                    ? "Clear date filter to use status tabs"
                    : undefined
                }
                onClick={() => {
                  if (dateFilterActive && !searchActive) return;
                  dispatch(setActiveTabLabel(f.label));
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs whitespace-nowrap transition-all ${
                  dateFilterActive && !searchActive
                    ? "text-slate-400 opacity-60 cursor-not-allowed"
                    : ui.activeTabLabel === f.label
                      ? "bg-blue-50 text-blue-600 border border-blue-200"
                      : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {f.label}
                {f.label !== "Cancelled" && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                      !dateFilterActive && ui.activeTabLabel === f.label
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {summaryFetching && !summary ? "…" : f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto px-2">
            <input
              type="search"
              placeholder="Search orders…"
              value={ui.searchInput}
              onChange={(e) => dispatch(setSearchInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") dispatch(commitSearch());
              }}
              className="w-full lg:w-90 pl-4 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
            />
            <button
              type="button"
              className="text-xs text-slate-500 px-2"
              onClick={() => dispatch(clearSearch())}
            >
              Clear
            </button>
          </div>
        </div>

        {dateFilterActive && !searchActive && (
          <div className="mx-3 mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              Date filter active — showing <strong>all statuses</strong> for this range (paginated). Clear filter to use status tabs again.
            </span>
            <button
              type="button"
              className="font-semibold text-indigo-700 underline underline-offset-2"
              onClick={() => {
                setCustomRangeError(null);
                setDraftDateFrom("");
                setDraftDateTo("");
                dispatch(clearDateFilter());
              }}
            >
              Clear filter
            </button>
          </div>
        )}

        {rowActionFeedback?.text ? (
          <div
            className={`mx-3 mt-2 rounded-lg border px-3 py-2 text-xs ${
              rowActionFeedback.type === "err"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
            role="status"
          >
            {rowActionFeedback.text}
            <button
              type="button"
              className="ml-2 text-[10px] underline opacity-80"
              onClick={() => setRowActionFeedback(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* ── Bulk selection bar ───────────────────────────────────────────── */}
        {selectedOrders.length > 0 && (
          <div className="flex flex-col gap-2 bg-blue-50 p-3 border-b border-blue-100">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setBulkInlineError(null);
                    setShowBulkMenu(!showBulkMenu);
                  }}
                  disabled={bulkActionsBusy}
                  className="bg-white border border-blue-200 text-blue-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase flex items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  Bulk actions ▾
                </button>
                {showBulkMenu && (
                  <div className="absolute left-0 top-full mt-1 min-w-[260px] bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                    {showBulkPendingActions ? (
                      <>
                        <button
                          type="button"
                          onClick={handleBulkConfirm}
                          disabled={bulkActionsBusy || !eligibleBulkConfirmIds.length}
                          title={
                            !eligibleBulkConfirmIds.length
                              ? "Select Pending orders where payment is ready (COD, or online paid / advance rules met). Unpaid online orders are not listed here."
                              : undefined
                          }
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          Confirm order(s)
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkCancel}
                          disabled={bulkActionsBusy || !eligibleBulkPendingIds.length}
                          title={
                            !eligibleBulkPendingIds.length
                              ? "Select Pending orders to cancel."
                              : undefined
                          }
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          Cancel order(s)
                        </button>
                      </>
                    ) : null}
                    {showBulkFulfillmentActions ? (
                      <button
                        type="button"
                        onClick={handleBulkShipNow}
                        disabled={bulkActionsBusy || !eligibleBulkShipIds.length}
                        title={
                          !eligibleBulkShipIds.length
                            ? "No selected orders are ready for Ship now (needs Confirmed + no AWB)."
                            : undefined
                        }
                        className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
                      >
                        Ship now (Shiprocket)
                      </button>
                    ) : null}
                    {showBulkFulfillmentActions ? (
                      <button
                        type="button"
                        onClick={handleBulkSyncShiprocket}
                        disabled={bulkActionsBusy || !eligibleBulkSyncIds.length}
                        title={
                          !eligibleBulkSyncIds.length
                            ? "No selected orders have a Shiprocket shipment to refresh."
                            : "Sync status, pickup date, and SRPID from Shiprocket."
                        }
                        className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
                      >
                        Refresh Shiprocket (sync + SRPID)
                      </button>
                    ) : null}
                    {showBulkFulfillmentActions ? (
                      <button
                        type="button"
                        onClick={openBulkPickupPanel}
                        disabled={bulkActionsBusy || !eligibleBulkPickupIds.length}
                        title={
                          !eligibleBulkPickupIds.length
                            ? "No selected orders need pickup scheduling (needs AWB, no pickup booked yet)."
                            : undefined
                        }
                        className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        Schedule pickup…
                      </button>
                    ) : null}
                    {showBulkTaxInvoicesZip && (
                      <button
                        type="button"
                        onClick={handleBulkTaxInvoicesZipRequest}
                        disabled={bulkActionsBusy || !eligibleBulkInvoiceIds.length}
                        title={
                          !eligibleBulkInvoiceIds.length
                            ? "Needs Confirmed (or later) orders in the selection."
                            : undefined
                        }
                        className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
                      >
                        Bulk tax invoices (ZIP)
                      </button>
                    )}
                    {showBulkFulfillmentActions ? (
                      <>
                        <button
                          type="button"
                          onClick={handleBulkManifestsZip}
                          disabled={bulkActionsBusy || !eligibleBulkManifestIds.length}
                          title={
                            !eligibleBulkManifestIds.length
                              ? "No selected orders can download manifest (needs AWB + shipment ops allow download)."
                              : undefined
                          }
                          className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
                        >
                          Bulk Shiprocket manifests (ZIP)
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkShippingLabelsZip}
                          disabled={bulkActionsBusy || !eligibleBulkLabelIds.length}
                          title={
                            !eligibleBulkLabelIds.length
                              ? "No selected orders can download label (needs AWB + shipment ops allow download)."
                              : undefined
                          }
                          className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          Bulk shipping labels (ZIP)
                        </button>
                      </>
                    ) : null}
                    {!eligibleBulkShipIds.length &&
                    !eligibleBulkSyncIds.length &&
                    !eligibleBulkPickupIds.length &&
                    !eligibleBulkManifestIds.length &&
                    !eligibleBulkLabelIds.length && (
                      <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
                        No ship, pickup, manifest, or label actions apply to the current selection. Select orders with
                        Shiprocket shipments and use Refresh Shiprocket to load SRPID.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-[11px] leading-snug text-slate-700">
                <p>
                  <span className="font-semibold text-slate-800">{selectedOrders.length}</span>{" "}
                  {selectedOrders.length === 1 ? "order selected" : "orders selected"}. Tap{" "}
                  <span className="font-semibold">Bulk actions</span>, then pick an item from the menu.
                </p>
                <p className="text-slate-600 mt-0.5">
                  {showBulkPendingActions ? (
                    <>
                      Confirm (payment ready):{" "}
                      <span className="font-semibold text-slate-700">{eligibleBulkConfirmIds.length}</span>
                      {" · "}
                      Cancel (pending):{" "}
                      <span className="font-semibold text-slate-700">{eligibleBulkPendingIds.length}</span>
                    </>
                  ) : null}
                  Ready for ship: <span className="font-semibold text-slate-700">{eligibleBulkShipIds.length}</span>
                  {" · "}
                  Refresh Shiprocket:{" "}
                  <span className="font-semibold text-slate-700">{eligibleBulkSyncIds.length}</span>
                  {" · "}
                  Ready for pickup:{" "}
                  <span className="font-semibold text-slate-700">{eligibleBulkPickupIds.length}</span>
                  {showBulkTaxInvoicesZip && (
                    <>
                      {" · "}
                      Tax invoice (ZIP):{" "}
                      <span className="font-semibold text-slate-700">{eligibleBulkInvoiceIds.length}</span>
                    </>
                  )}
                  {showBulkFulfillmentActions && (
                    <>
                      {" · "}
                      Manifest (ZIP):{" "}
                      <span className="font-semibold text-slate-700">{eligibleBulkManifestIds.length}</span>
                      {" · "}
                      Shipping label (ZIP):{" "}
                      <span className="font-semibold text-slate-700">{eligibleBulkLabelIds.length}</span>
                    </>
                  )}
                  {eligibleBulkShipIds.length === 0 && eligibleBulkPickupIds.length === 0 && (
                    <span className="text-slate-500"> — Ship / pickup not for these rows at this step.</span>
                  )}
                </p>
              </div>
            </div>

            {bulkInlineError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                {bulkInlineError}
              </div>
            )}

            {bulkFeedback && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {bulkFeedback.kind === "confirm"
                      ? "Bulk confirm"
                      : bulkFeedback.kind === "cancel"
                        ? "Bulk cancel"
                        : bulkFeedback.kind === "ship"
                          ? "Bulk ship"
                          : bulkFeedback.kind === "sync"
                            ? "Bulk Refresh Shiprocket"
                            : "Bulk pickup"} finished:{" "}
                    <strong>{bulkFeedback.summary?.completed ?? 0}</strong> completed,{" "}
                    <strong>{bulkFeedback.summary?.skipped ?? 0}</strong> skipped,{" "}
                    <strong>{bulkFeedback.summary?.failed ?? 0}</strong> failed (of {bulkFeedback.summary?.total ?? 0}
                    ).
                    {bulkFeedback.kind === "sync" && bulkFeedback.summary?.pickupIdsSaved != null ? (
                      <>
                        {" "}
                        SRPID saved: <strong>{bulkFeedback.summary.pickupIdsSaved}</strong>.
                      </>
                    ) : null}
                    {bulkFeedback.extraSkipped > 0
                      ? ` ${bulkFeedback.extraSkipped} selected row(s) were not sent (ineligible).`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-emerald-800 underline"
                    onClick={() => setBulkFeedback(null)}
                  >
                    Dismiss
                  </button>
                </div>
                {Array.isArray(bulkFeedback.results) &&
                  bulkFeedback.results.some((r) => r && !r.success && !r.skipped) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] font-semibold text-emerald-900">
                        View failed rows
                      </summary>
                      <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                        {bulkFeedback.results
                          .filter((r) => r && !r.success && !r.skipped)
                          .map((r) => (
                            <li key={r.orderId}>
                              <span className="font-mono">{r.orderId}</span>: {r.message || r.code || "Error"}
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}
              </div>
            )}

            {bulkPickupPanelOpen && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-blue-200 bg-white/80 p-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Pickup date</label>
                  {bulkPickupCalendarRes?.preferences?.hasScheduleRules ? (
                    <p className="text-[10px] text-slate-500 max-w-xs">
                      Dates follow your Shiprocket panel schedule.
                    </p>
                  ) : bulkPickupCalendarRes?.scheduleRulesMessage ? (
                    <p className="text-[10px] text-amber-800 max-w-xs">
                      {bulkPickupCalendarRes.scheduleRulesMessage}
                    </p>
                  ) : null}
                  {bulkPickupCalendarRes?.preferences?.hasScheduleRules && bulkPickupAllowedDates.length > 0 ? (
                    <select
                      value={
                        bulkPickupAllowedDates.includes(bulkPickupDate)
                          ? bulkPickupDate
                          : bulkPickupAllowedDates[0]
                      }
                      onChange={(e) => setBulkPickupDate(e.target.value)}
                      className="bg-white border border-slate-200 text-xs px-2 py-1.5 rounded-lg min-w-[11rem]"
                    >
                      {bulkPickupAllowedDates.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="date"
                      min={toLocalYmd(new Date())}
                      value={bulkPickupDate}
                      onChange={(e) => setBulkPickupDate(e.target.value)}
                      className="bg-white border border-slate-200 text-xs px-2 py-1.5 rounded-lg"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleBulkSchedulePickupRun}
                  disabled={bulkActionsBusy || !eligibleBulkPickupIds.length || !bulkPickupDate}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50"
                >
                  Schedule pickup ({eligibleBulkPickupIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBulkPickupPanelOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {(listLoading || listFetching) && orders.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">Loading orders…</p>
        )}

        {/* ── DESKTOP: original table — hidden on mobile ───────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F8FAFC] border-b border-slate-200">
              <tr className="text-[11px] text-slate-900 uppercase tracking-tight">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    onChange={toggleSelectAll}
                    checked={orders.length > 0 && selectedOrders.length === orders.length}
                  />
                </th>
                <th className="px-4 py-4 text-[#2563eb]">Order ID</th>
                <th className="px-4 py-4 text-[#2563eb]">Contact</th>
                <th className="px-4 py-4 text-[#2563eb]">Date</th>
                <th className="px-4 py-4 text-[#2563eb] text-right">Amount</th>
                <th className="px-4 py-4 text-[#2563eb] text-center">Status</th>
                <th className="px-4 py-4 text-[#2563eb]">Courier &amp; ops</th>
                <th className="px-4 py-4 text-[#2563eb] text-center">Action</th>
                <th className="px-4 py-4 text-[#2563eb] text-center">Items</th>
                <th className="px-4 py-4 text-[#2563eb] text-center">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {orders.map((order) => (
                <tr
                  key={order.orderId}
                  onClick={() => setSelectedOrderId(order.orderId)}
                  className={`hover:bg-blue-50/30 transition-colors text-[13px] text-slate-700 cursor-pointer ${
                    selectedOrders.includes(order.orderId) ? "bg-blue-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selectedOrders.includes(order.orderId)}
                      onChange={() => toggleSelectOrder(order.orderId)}
                    />
                  </td>
                  <td className="px-4 py-4 text-slate-900 font-medium">
                    <div>{order.orderIdDisplay || order.orderId}</div>
                    <span
                      className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
                        order.shippingProvider === "shipmozo"
                          ? "bg-teal-50 text-teal-800 border-teal-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}
                    >
                      {order.shippingProvider === "shipmozo" ? "Shipmozo" : "Shiprocket"}
                    </span>
                    {(order.shiprocketPickupIdDisplay || order.shiprocketPickupId) &&
                    order.shippingProvider !== "shipmozo" ? (
                      <p className="text-[10px] font-semibold text-indigo-700 mt-0.5 tracking-wide">
                        SRPID:{" "}
                        {(() => {
                          const d = String(order.shiprocketPickupIdDisplay || "").trim();
                          if (/^SRPID-/i.test(d)) return d.toUpperCase();
                          if (d) return d.startsWith("SRPID") ? d : `SRPID-${d.replace(/\D/g, "") || d}`;
                          const raw = String(order.shiprocketPickupId || "").trim();
                          if (/^SRPID-/i.test(raw)) return raw.toUpperCase();
                          const digits = raw.replace(/\D/g, "");
                          return digits ? `SRPID-${digits}` : raw;
                        })()}
                      </p>
                    ) : null}
                    {order.shippingProvider === "shipmozo" &&
                    (order.shipmozoOrderIdDisplay || order.shipmozoOrderId) ? (
                      <p className="text-[10px] font-semibold text-teal-800 mt-0.5 tracking-wide font-mono truncate max-w-[14rem]">
                        Shipmozo ID: {order.shipmozoOrderIdDisplay || order.shipmozoOrderId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-500">{order.contactPhone || "—"}</td>
                  <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-slate-900 text-right">{formatInr(order.amountInr)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs font-semibold">
                      {order.fulfillmentLabel || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-4 min-w-[10rem]">
                    <p className="text-xs font-semibold text-slate-800 leading-snug">
                      {order.courierOpsLine1 || "—"}
                    </p>
                    {order.courierOpsLine2 ? (
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{order.courierOpsLine2}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-center relative overflow-visible">
                    <AdminOrderRowActions
                      order={order}
                      onOpenDetail={setSelectedOrderId}
                      onFeedback={(fb) => {
                        if (fb?.type === "err" && fb.text) {
                          setRowActionFeedback({ type: "err", text: fb.text });
                        } else if (fb?.type === "ok") {
                          setRowActionFeedback({
                            type: "ok",
                            text: "Action completed. List will refresh automatically.",
                          });
                          refetchList?.();
                          refetchSummary?.();
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-4 text-center">{order.itemCount}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-emerald-700 text-xs font-medium">{order.paymentLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE: order cards — hidden on desktop ──────────────────────── */}
        <div className="block md:hidden divide-y divide-slate-100">
          {/* Mobile select-all bar */}
          {orders.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                onChange={toggleSelectAll}
                checked={orders.length > 0 && selectedOrders.length === orders.length}
              />
              <span className="text-xs text-slate-500">Select all</span>
            </div>
          )}

          {orders.map((order) => (
            <div
              key={order.orderId}
              onClick={() => setSelectedOrderId(order.orderId)}
              className={`p-4 cursor-pointer transition-colors ${
                selectedOrders.includes(order.orderId)
                  ? "bg-blue-50/60"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              {/* Card header: checkbox + order id + status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selectedOrders.includes(order.orderId)}
                      onChange={() => toggleSelectOrder(order.orderId)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {order.orderIdDisplay || order.orderId}
                    </p>
                    <span
                      className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
                        order.shippingProvider === "shipmozo"
                          ? "bg-teal-50 text-teal-800 border-teal-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}
                    >
                      {order.shippingProvider === "shipmozo" ? "Shipmozo" : "Shiprocket"}
                    </span>
                    {order.shippingProvider !== "shipmozo" && order.shiprocketPickupIdDisplay ? (
                      <p className="text-[10px] font-semibold text-indigo-700 mt-0.5 tracking-wide">
                        SRPID: {order.shiprocketPickupIdDisplay}
                      </p>
                    ) : null}
                    {order.shippingProvider === "shipmozo" &&
                    (order.shipmozoOrderIdDisplay || order.shipmozoOrderId) ? (
                      <p className="text-[10px] font-semibold text-teal-800 mt-0.5 tracking-wide font-mono truncate">
                        Shipmozo ID: {order.shipmozoOrderIdDisplay || order.shipmozoOrderId}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap">
                  {order.fulfillmentLabel || "—"}
                </span>
              </div>

              {/* Card body: 2-col data grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Contact</p>
                  <p className="text-xs text-slate-700 font-medium mt-0.5">{order.contactPhone || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Amount</p>
                  <p className="text-xs text-slate-900 font-semibold mt-0.5">{formatInr(order.amountInr)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Date</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(order.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Payment</p>
                  <p className="text-xs text-emerald-700 font-medium mt-0.5">{order.paymentLabel || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Courier &amp; ops</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-snug">
                    {order.courierOpsLine1 || "—"}
                  </p>
                  {order.courierOpsLine2 ? (
                    <p className="text-[10px] text-slate-500 leading-snug">{order.courierOpsLine2}</p>
                  ) : null}
                </div>
              </div>

              {/* Card footer: items count + action button */}
              <div
                className="flex items-center justify-between px-4 py-2.5 -mx-4 -mb-4 mt-3 bg-slate-50 rounded-b-xl border-b border-slate-600"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[11px] text-slate-400">
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                </span>
                <AdminOrderRowActions
                  order={order}
                  onOpenDetail={setSelectedOrderId}
                  onFeedback={(fb) => {
                    if (fb?.type === "err" && fb.text) {
                      setRowActionFeedback({ type: "err", text: fb.text });
                    } else if (fb?.type === "ok") {
                      setRowActionFeedback({
                        type: "ok",
                        text: "Action completed. List will refresh automatically.",
                      });
                      refetchList?.();
                      refetchSummary?.();
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* ── End mobile cards ─────────────────────────────────────────────── */}

        {pagination && pagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <span>
              Page {pagination.page} of {pagination.totalPages || 1} · {pagination.total} orders
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrevPage}
                onClick={() => dispatch(setPage(pagination.page - 1))}
                className="px-3 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => dispatch(setPage(pagination.page + 1))}
                className="px-3 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {!listLoading && orders.length === 0 && !listIsError && (
          <p className="p-8 text-center text-sm text-slate-500">No orders in this range / filter.</p>
        )}
      </div>

      {bulkInvoiceAwbModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-invoice-awb-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-slate-200">
            <h2 id="bulk-invoice-awb-title" className="text-sm font-bold text-slate-900">
              Some selected orders have no AWB yet
            </h2>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              The invoice can still be generated; the AWB / courier block will stay empty until tracking exists. Choose{" "}
              <strong>Yes</strong> to download the ZIP for all eligible selected orders anyway, or <strong>No</strong> to
              cancel and run <strong>Ship now</strong> first where you need AWBs filled in.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              {invoiceSelectionMissingAwb} of {eligibleBulkInvoiceIds.length} invoice-eligible selected order(s) are
              missing AWB.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setBulkInvoiceAwbModalOpen(false)}
              >
                No, cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-900"
                onClick={() => void runBulkTaxInvoicesZipDownload()}
              >
                Yes, download ZIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTab;

// down code is working but upper code is responsive 
// import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import {
//   setActiveTabLabel,
//   setSearchInput,
//   commitSearch,
//   clearSearch,
//   setPage,
//   setDatePreset,
//   commitCustomRange,
//   ORDER_TAB_LABEL_TO_BUCKET,
//   selectAdminOrdersListQueryArgs,
//   selectAdminOrdersSummaryQueryArgs,
// } from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
// import {
//   useGetAdminOrdersSummaryQuery,
//   useGetAdminOrdersListQuery,
//   useGetAdminOrderDetailQuery,
//   useGetAdminOrderTrackingQuery,
//   useAdminBulkApprovalCancelMutation,
//   useAdminBulkApprovalConfirmMutation,
//   useAdminBulkFulfillmentShipNowMutation,
//   useAdminBulkFulfillmentSchedulePickupMutation,
//   useAdminBulkFulfillmentSyncShiprocketMutation,
//   useGetAdminPickupCalendarQuery,
// } from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersApi";
// import { isPostConfirmOrderStatus } from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
// import {
//   canAdminBulkCancelOrderRow,
//   canAdminBulkConfirmOrderRow,
//   canAdminBulkDownloadLabelOrderRow,
//   canAdminBulkDownloadManifestOrderRow,
//   canAdminBulkSchedulePickupOrderRow,
//   canAdminBulkShipNowOrderRow,
//   canAdminBulkSyncShiprocketOrderRow,
// } from "../../../../utils/adminOrderFulfillmentEligibility";
// import AdminOrderDetailView from "./AdminOrderDetailView";
// import AdminOrderRowActions from "./AdminOrderRowActions";
// import wholesaleAxios from "../../../../SERVICES/Wholesaleaxios";
// import { useSearchParams } from "react-router-dom";

// const TAB_ORDER = [
//   "All",
//   "Pending",
//   "Confirmed",
//   "Processing",
//   "In transit",
//   "Delivered",
//   "Cancelled",
// ];

// function formatInr(amount) {
//   const n = Number(amount);
//   if (!Number.isFinite(n)) return "—";
//   return new Intl.NumberFormat("en-IN", {
//     style: "currency",
//     currency: "INR",
//     maximumFractionDigits: 0,
//   }).format(n);
// }

// function formatDateTime(iso) {
//   if (!iso) return "—";
//   const d = new Date(iso);
//   if (Number.isNaN(d.getTime())) return "—";
//   return new Intl.DateTimeFormat("en-IN", {
//     month: "short",
//     day: "numeric",
//     hour: "numeric",
//     minute: "2-digit",
//     hour12: true,
//   }).format(d);
// }

// /** Local calendar YYYY-MM-DD */
// function toLocalYmd(d) {
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, "0");
//   const day = String(d.getDate()).padStart(2, "0");
//   return `${y}-${m}-${day}`;
// }

// function addLocalDaysYmd(days) {
//   const t = new Date();
//   t.setDate(t.getDate() + days);
//   return toLocalYmd(t);
// }

// function mutationErrorToString(err) {
//   if (!err) return "Request failed.";
//   const d = err.data;
//   if (typeof d === "object" && d && d.message) return String(d.message);
//   if (typeof d === "string") return d;
//   return err.message || "Request failed.";
// }

// async function messageFromMaybeErrorBlob(blob) {
//   if (!(blob instanceof Blob)) return "Request failed.";
//   try {
//     const text = await blob.text();
//     const j = JSON.parse(text);
//     if (j && typeof j === "object" && j.message) return String(j.message);
//     if (j && typeof j === "object" && j.code) return String(j.code);
//     return text.slice(0, 500) || "Request failed.";
//   } catch {
//     return "Request failed.";
//   }
// }

// function downloadBlobFile(blob, filename) {
//   const url = URL.createObjectURL(blob);
//   try {
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = filename;
//     a.rel = "noopener";
//     document.body.appendChild(a);
//     a.click();
//     document.body.removeChild(a);
//   } finally {
//     URL.revokeObjectURL(url);
//   }
// }

// function ApiErrorBanner({ error }) {
//   if (!error) return null;
//   const msg =
//     error?.data?.message ||
//     error?.message ||
//     (typeof error?.data === "string" ? error.data : null) ||
//     "Something went wrong while loading orders.";
//   return (
//     <div
//       className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
//       role="alert"
//     >
//       {msg}
//     </div>
//   );
// }

// const OrderTab = () => {
//   const dispatch = useDispatch();
//   const listArgs = useSelector(selectAdminOrdersListQueryArgs);
//   const summaryArgs = useSelector(selectAdminOrdersSummaryQueryArgs);
//   const ui = useSelector((s) => s.adminOrdersUi);

//   const [selectedOrderId, setSelectedOrderId] = useState(null);
//   const [searchParams] = useSearchParams();
//   const activeTab = searchParams.get("tab");

//   const {
//     data: summaryRes,
//     isLoading: summaryLoading,
//     isFetching: summaryFetching,
//     error: summaryError,
//     isError: summaryIsError,
//   } = useGetAdminOrdersSummaryQuery(summaryArgs);

//   const {
//     data: listRes,
//     isLoading: listLoading,
//     isFetching: listFetching,
//     error: listError,
//     isError: listIsError,
//   } = useGetAdminOrdersListQuery(listArgs);

//   const {
//     data: detailRes,
//     isLoading: detailLoading,
//     error: detailError,
//     isError: detailIsError,
//     refetch: refetchOrderDetail,
//   } = useGetAdminOrderDetailQuery(selectedOrderId, {
//     skip: !selectedOrderId,
//   });

//   const {
//     data: trackingRes,
//     isLoading: trackingLoading,
//     isFetching: trackingFetching,
//     error: trackingError,
//     isError: trackingIsError,
//     refetch: refetchTracking,
//   } = useGetAdminOrderTrackingQuery(selectedOrderId, {
//     skip: !selectedOrderId,
//     refetchOnFocus: true,
//     refetchOnReconnect: true,
//     pollingInterval: selectedOrderId ? 30000 : 0,
//   });

//   const summary = summaryRes?.data;
//   const listPayload = listRes?.data;
//   const orders = listPayload?.orders ?? [];
//   const pagination = listPayload?.pagination;
//   const detailOrder = detailRes?.order;
//   const fulfillmentPaymentGate = detailRes?.fulfillmentPaymentGate;
//   const tracking = trackingRes?.tracking || null;

//   const [selectedOrders, setSelectedOrders] = useState([]);
//   const [showBulkMenu, setShowBulkMenu] = useState(false);
//   const [bulkPickupPanelOpen, setBulkPickupPanelOpen] = useState(false);
//   const [bulkPickupDate, setBulkPickupDate] = useState("");
//   const { data: bulkPickupCalendarRes } = useGetAdminPickupCalendarQuery(
//     { daysAhead: 45 },
//     { skip: !bulkPickupPanelOpen }
//   );
//   const bulkPickupAllowedDates = useMemo(
//     () =>
//       Array.isArray(bulkPickupCalendarRes?.calendar?.allowedDates)
//         ? bulkPickupCalendarRes.calendar.allowedDates
//         : [],
//     [bulkPickupCalendarRes?.calendar?.allowedDates]
//   );
//   const [bulkInlineError, setBulkInlineError] = useState(null);

//   useEffect(() => {
//     if (!bulkPickupPanelOpen) return;
//     const def = bulkPickupCalendarRes?.calendar?.defaultDate;
//     if (def && bulkPickupAllowedDates.includes(def)) {
//       setBulkPickupDate(def);
//     }
//   }, [bulkPickupPanelOpen, bulkPickupCalendarRes?.calendar?.defaultDate, bulkPickupAllowedDates]);
//   const [bulkFeedback, setBulkFeedback] = useState(null);

//   const [bulkConfirm, bulkConfirmState] = useAdminBulkApprovalConfirmMutation();
//   const [bulkCancel, bulkCancelState] = useAdminBulkApprovalCancelMutation();
//   const [bulkShipNow, bulkShipNowState] = useAdminBulkFulfillmentShipNowMutation();
//   const [bulkSchedulePickup, bulkSchedulePickupState] = useAdminBulkFulfillmentSchedulePickupMutation();
//   const [bulkSyncShiprocket, bulkSyncShiprocketState] = useAdminBulkFulfillmentSyncShiprocketMutation();
//   const bulkBusy =
//     bulkConfirmState.isLoading ||
//     bulkCancelState.isLoading ||
//     bulkShipNowState.isLoading ||
//     bulkSchedulePickupState.isLoading ||
//     bulkSyncShiprocketState.isLoading;
//   const [bulkZipBusy, setBulkZipBusy] = useState(false);
//   const [bulkInvoiceAwbModalOpen, setBulkInvoiceAwbModalOpen] = useState(false);
//   const [rowActionFeedback, setRowActionFeedback] = useState(null);
//   const bulkActionsBusy = bulkBusy || bulkZipBusy;

//   const orderById = useMemo(() => new Map(orders.map((o) => [o.orderId, o])), [orders]);

//   const eligibleBulkInvoiceIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         if (!o) return false;
//         return isPostConfirmOrderStatus(o.orderStatus);
//       }),
//     [selectedOrders, orderById]
//   );

//   const eligibleBulkLabelIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkDownloadLabelOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   const eligibleBulkManifestIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkDownloadManifestOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   const invoiceSelectionMissingAwb = useMemo(
//     () => eligibleBulkInvoiceIds.filter((id) => !orderById.get(id)?.hasAwb).length,
//     [eligibleBulkInvoiceIds, orderById]
//   );

//   const showBulkTaxInvoicesZip = ui.activeTabLabel === "Confirmed";
//   const showBulkFulfillmentActions = selectedOrders.length > 0;

//   /** Any pending row — cancel does not require payment capture. */
//   const eligibleBulkPendingIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkCancelOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   /** Pending + same payment gate as order detail Confirm (from list API `canConfirmForFulfillment`). */
//   const eligibleBulkConfirmIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkConfirmOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   const showBulkPendingActions = ui.activeTabLabel === "Pending";

//   const eligibleBulkShipIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkShipNowOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   const eligibleBulkPickupIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkSchedulePickupOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   const eligibleBulkSyncIds = useMemo(
//     () =>
//       selectedOrders.filter((id) => {
//         const o = orderById.get(id);
//         return canAdminBulkSyncShiprocketOrderRow(o);
//       }),
//     [selectedOrders, orderById]
//   );

//   useEffect(() => {
//     setSelectedOrders([]);
//     setShowBulkMenu(false);
//     setBulkPickupPanelOpen(false);
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     setBulkInvoiceAwbModalOpen(false);
//     setBulkZipBusy(false);
//   }, [ui.page, ui.activeTabLabel, ui.search, ui.datePreset, ui.customDateFrom, ui.customDateTo]);

//   useEffect(() => {
//   setSelectedOrderId(null);
// }, [activeTab]);

//   /** Draft dates for Custom range — committed via Apply only */
//   const [draftDateFrom, setDraftDateFrom] = useState("");
//   const [draftDateTo, setDraftDateTo] = useState("");
//   const [customRangeError, setCustomRangeError] = useState(null);

//   const searchDebounceBoot = useRef(true);
//   /** Debounced search: commit 500ms after user stops typing (skip first paint) */
//   useEffect(() => {
//     if (searchDebounceBoot.current) {
//       searchDebounceBoot.current = false;
//       return undefined;
//     }
//     const t = setTimeout(() => {
//       dispatch(commitSearch());
//     }, 500);
//     return () => clearTimeout(t);
//   }, [ui.searchInput, dispatch]);

//   const stats = useMemo(() => {
//     const t = summary?.totals;
//     if (!t) {
//       return [
//         { label: "Total orders", value: "—" },
//         { label: "Total revenue", value: "—" },
//         { label: "Total pending orders", value: "—" },
//         { label: "Total completed orders", value: "—" },
//       ];
//     }
//     return [
//       { label: "Total orders", value: String(t.totalOrders ?? 0) },
//       { label: "Total revenue", value: formatInr(t.totalRevenueInr) },
//       { label: "Total pending orders", value: String(t.totalPendingOrders ?? 0) },
//       { label: "Total completed orders", value: String(t.totalCompletedOrders ?? 0) },
//     ];
//   }, [summary]);

//   const filters = useMemo(() => {
//     const c = summary?.countsByBucket || {};
//     return TAB_ORDER.map((label) => {
//       const key = ORDER_TAB_LABEL_TO_BUCKET[label];
//       const count = key === "all" ? c.all ?? 0 : c[key] ?? 0;
//       return { label, count };
//     });
//   }, [summary]);

//   const handleDownloadReport = useCallback(() => {
//     const rows = orders.map((o) => ({
//       id: o.orderIdDisplay || o.orderId,
//       contact: o.contactPhone || "",
//       date: formatDateTime(o.createdAt),
//       amount: formatInr(o.amountInr),
//       status: o.fulfillmentLabel || "",
//       items: o.itemCount,
//       payment: o.paymentLabel || "",
//     }));
//     const header = "Order ID,Contact,Date,Amount,Status,Items,Payment";
//     const csvContent =
//       "data:text/csv;charset=utf-8," +
//       header +
//       "\n" +
//       rows
//         .map((o) =>
//           [o.id, o.contact, o.date, o.amount, o.status, o.items, o.payment]
//             .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
//             .join(",")
//         )
//         .join("\n");
//     const encodedUri = encodeURI(csvContent);
//     const link = document.createElement("a");
//     link.setAttribute("href", encodedUri);
//     link.setAttribute("download", "Orders_Report.csv");
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   }, [orders]);

//   const handleBulkCancel = useCallback(async () => {
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     if (!eligibleBulkPendingIds.length) {
//       setBulkInlineError("No eligible orders. Cancel applies to Pending orders only.");
//       return;
//     }
//     if (
//       !window.confirm(
//         `Cancel ${eligibleBulkPendingIds.length} pending order(s)? Stock will be restored for each.`
//       )
//     ) {
//       return;
//     }
//     try {
//       const data = await bulkCancel({ orderIds: eligibleBulkPendingIds }).unwrap();
//       setBulkFeedback({
//         kind: "cancel",
//         summary: data.summary,
//         results: data.results || [],
//         extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkPendingIds.length),
//       });
//       setShowBulkMenu(false);
//     } catch (err) {
//       setBulkInlineError(mutationErrorToString(err));
//     }
//   }, [bulkCancel, eligibleBulkPendingIds, selectedOrders.length]);

//   const handleBulkConfirm = useCallback(async () => {
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     if (!eligibleBulkConfirmIds.length) {
//       setBulkInlineError(
//         "No eligible orders. Confirm applies to Pending orders with payment ready (COD or paid online)."
//       );
//       return;
//     }
//     try {
//       const data = await bulkConfirm({ orderIds: eligibleBulkConfirmIds }).unwrap();
//       setBulkFeedback({
//         kind: "confirm",
//         summary: data.summary,
//         results: data.results || [],
//         extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkConfirmIds.length),
//       });
//       setShowBulkMenu(false);
//     } catch (err) {
//       setBulkInlineError(mutationErrorToString(err));
//     }
//   }, [bulkConfirm, eligibleBulkConfirmIds, selectedOrders.length]);

//   const handleBulkShipNow = useCallback(async () => {
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     if (!eligibleBulkShipIds.length) {
//       setBulkInlineError(
//         "No eligible orders in the selection. Bulk ship needs Confirmed orders without an AWB yet."
//       );
//       return;
//     }
//     try {
//       const data = await bulkShipNow({ orderIds: eligibleBulkShipIds }).unwrap();
//       setBulkFeedback({
//         kind: "ship",
//         summary: data.summary,
//         results: data.results || [],
//         extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkShipIds.length),
//       });
//       setShowBulkMenu(false);
//     } catch (err) {
//       setBulkInlineError(mutationErrorToString(err));
//     }
//   }, [bulkShipNow, eligibleBulkShipIds, selectedOrders.length]);

//   const handleBulkSchedulePickupRun = useCallback(async () => {
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     const ymd = String(bulkPickupDate || "").trim();
//     if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
//       setBulkInlineError("Choose a valid pickup date (YYYY-MM-DD).");
//       return;
//     }
//     if (!eligibleBulkPickupIds.length) {
//       setBulkInlineError(
//         "No eligible orders. Pickup scheduling needs an AWB and no pickup date set yet (Confirmed or Processing)."
//       );
//       return;
//     }
//     try {
//       const data = await bulkSchedulePickup({
//         orderIds: eligibleBulkPickupIds,
//         pickupDate: ymd,
//       }).unwrap();
//       setBulkFeedback({
//         kind: "pickup",
//         summary: data.summary,
//         results: data.results || [],
//         extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkPickupIds.length),
//       });
//       setShowBulkMenu(false);
//       setBulkPickupPanelOpen(false);
//     } catch (err) {
//       setBulkInlineError(mutationErrorToString(err));
//     }
//   }, [
//     bulkPickupDate,
//     bulkSchedulePickup,
//     eligibleBulkPickupIds,
//     selectedOrders.length,
//   ]);

//   const handleBulkSyncShiprocket = useCallback(async () => {
//     setBulkInlineError(null);
//     setBulkFeedback(null);
//     if (!eligibleBulkSyncIds.length) {
//       setBulkInlineError("No eligible orders. Refresh Shiprocket needs a Shiprocket shipment on the order.");
//       return;
//     }
//     if (
//       !window.confirm(
//         `Refresh Shiprocket for ${eligibleBulkSyncIds.length} order(s)? This syncs status and pickup ID (SRPID).`
//       )
//     ) {
//       return;
//     }
//     try {
//       const data = await bulkSyncShiprocket({ orderIds: eligibleBulkSyncIds }).unwrap();
//       setBulkFeedback({
//         kind: "sync",
//         summary: data.summary,
//         results: data.results || [],
//         extraSkipped: Math.max(0, selectedOrders.length - eligibleBulkSyncIds.length),
//       });
//       setShowBulkMenu(false);
//     } catch (err) {
//       setBulkInlineError(mutationErrorToString(err));
//     }
//   }, [bulkSyncShiprocket, eligibleBulkSyncIds, selectedOrders.length]);

//   const openBulkPickupPanel = useCallback(() => {
//     setBulkInlineError(null);
//     setBulkPickupDate((d) => d || addLocalDaysYmd(1));
//     setBulkPickupPanelOpen(true);
//     setShowBulkMenu(false);
//   }, []);

//   const runBulkTaxInvoicesZipDownload = useCallback(async () => {
//     if (!eligibleBulkInvoiceIds.length) {
//       setBulkInlineError(
//         "No eligible orders for bulk tax invoices. Cancelled and payment-failed rows are excluded."
//       );
//       return;
//     }
//     setBulkInlineError(null);
//     setBulkInvoiceAwbModalOpen(false);
//     setBulkZipBusy(true);
//     try {
//       const res = await wholesaleAxios.post(
//         "/orders/admin/items/bulk-documents/tax-invoices-zip",
//         { orderIds: eligibleBulkInvoiceIds, concurrency: 4 },
//         { responseType: "blob", timeout: 180000 }
//       );
//       const blob = res.data;
//       const ct = String(res.headers["content-type"] || "");
//       if (ct.includes("application/json")) {
//         const msg = await messageFromMaybeErrorBlob(blob);
//         throw new Error(msg);
//       }
//       if (!(blob instanceof Blob) || blob.size === 0) {
//         throw new Error("Unexpected empty response from server.");
//       }
//       downloadBlobFile(blob, `tax-invoices-bulk-${Date.now()}.zip`);
//       setShowBulkMenu(false);
//     } catch (e) {
//       const payload = e.response?.data;
//       if (payload instanceof Blob) {
//         setBulkInlineError(await messageFromMaybeErrorBlob(payload));
//       } else {
//         setBulkInlineError(e?.message || mutationErrorToString(e));
//       }
//     } finally {
//       setBulkZipBusy(false);
//     }
//   }, [eligibleBulkInvoiceIds]);

//   const handleBulkTaxInvoicesZipRequest = useCallback(() => {
//     setBulkInlineError(null);
//     if (!eligibleBulkInvoiceIds.length) {
//       setBulkInlineError(
//         "No eligible orders for bulk tax invoices. Cancelled and payment-failed rows are excluded."
//       );
//       return;
//     }
//     if (invoiceSelectionMissingAwb > 0) {
//       setBulkInvoiceAwbModalOpen(true);
//       return;
//     }
//     void runBulkTaxInvoicesZipDownload();
//   }, [eligibleBulkInvoiceIds, invoiceSelectionMissingAwb, runBulkTaxInvoicesZipDownload]);

//   const handleBulkShippingLabelsZip = useCallback(async () => {
//     if (!eligibleBulkLabelIds.length) {
//       setBulkInlineError(
//         "No eligible orders for label ZIP. Each row needs an AWB (use Ship first) and a shipment id. Cancelled / payment-failed rows are excluded."
//       );
//       return;
//     }
//     setBulkInlineError(null);
//     setBulkZipBusy(true);
//     try {
//       const res = await wholesaleAxios.post(
//         "/orders/admin/items/bulk-documents/shipping-labels-zip",
//         { orderIds: eligibleBulkLabelIds, concurrency: 4 },
//         { responseType: "blob", timeout: 180000 }
//       );
//       const blob = res.data;
//       const ct = String(res.headers["content-type"] || "");
//       if (ct.includes("application/json")) {
//         const msg = await messageFromMaybeErrorBlob(blob);
//         throw new Error(msg);
//       }
//       if (!(blob instanceof Blob) || blob.size === 0) {
//         throw new Error("Unexpected empty response from server.");
//       }
//       downloadBlobFile(blob, `shipping-labels-bulk-${Date.now()}.zip`);
//       setShowBulkMenu(false);
//     } catch (e) {
//       const payload = e.response?.data;
//       if (payload instanceof Blob) {
//         setBulkInlineError(await messageFromMaybeErrorBlob(payload));
//       } else {
//         setBulkInlineError(e?.message || mutationErrorToString(e));
//       }
//     } finally {
//       setBulkZipBusy(false);
//     }
//   }, [eligibleBulkLabelIds]);

//   const handleBulkManifestsZip = useCallback(async () => {
//     if (!eligibleBulkManifestIds.length) {
//       setBulkInlineError(
//         "No eligible orders for manifest ZIP. Each row needs AWB and shipment id (Ship now first)."
//       );
//       return;
//     }
//     setBulkInlineError(null);
//     setBulkZipBusy(true);
//     try {
//       const res = await wholesaleAxios.post(
//         "/orders/admin/items/bulk-documents/manifests-zip",
//         { orderIds: eligibleBulkManifestIds, concurrency: 4 },
//         { responseType: "blob", timeout: 180000 }
//       );
//       const blob = res.data;
//       const ct = String(res.headers["content-type"] || "");
//       if (ct.includes("application/json")) {
//         const msg = await messageFromMaybeErrorBlob(blob);
//         throw new Error(msg);
//       }
//       if (!(blob instanceof Blob) || blob.size === 0) {
//         throw new Error("Unexpected empty response from server.");
//       }
//       downloadBlobFile(blob, `shiprocket-manifests-bulk-${Date.now()}.zip`);
//       setShowBulkMenu(false);
//     } catch (e) {
//       const payload = e.response?.data;
//       if (payload instanceof Blob) {
//         setBulkInlineError(await messageFromMaybeErrorBlob(payload));
//       } else {
//         setBulkInlineError(e?.message || mutationErrorToString(e));
//       }
//     } finally {
//       setBulkZipBusy(false);
//     }
//   }, [eligibleBulkManifestIds]);

//   const toggleSelectAll = () => {
//     const ids = orders.map((o) => o.orderId);
//     if (selectedOrders.length === ids.length) setSelectedOrders([]);
//     else setSelectedOrders(ids);
//   };

//   const toggleSelectOrder = (id) => {
//     setSelectedOrders((prev) =>
//       prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
//     );
//   };

//   if (selectedOrderId) {
//     return (
//       <AdminOrderDetailView
//         orderId={selectedOrderId}
//         order={detailOrder}
//         fulfillmentPaymentGate={fulfillmentPaymentGate}
//         loading={detailLoading}
//         error={detailIsError ? detailError : null}
//         tracking={tracking}
//         trackingLoading={trackingLoading || trackingFetching}
//         trackingError={trackingIsError ? trackingError : null}
//         onRefreshTracking={() => refetchTracking()}
//         onOrderRefresh={() => refetchOrderDetail()}
//         onBack={() => setSelectedOrderId(null)}
//       />
//     );
//   }

//   return (
//     <div className="p-4 space-y-6 bg-[#F8FAFC] min-h-screen">
//       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
//         <div className="flex flex-col gap-1 min-w-0">
//           <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
//           <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders</h1>
//           <div className="flex flex-wrap items-center gap-2">
//             <select
//               className="bg-white border border-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-sm outline-none"
//               value={ui.datePreset}
//               onChange={(e) => {
//                 const v = e.target.value;
//                 setCustomRangeError(null);
//                 if (v === "custom") {
//                   const toD = new Date();
//                   const fromD = new Date(toD.getTime() - 6 * 24 * 60 * 60 * 1000);
//                   const toStr = toLocalYmd(toD);
//                   const fromStr = toLocalYmd(fromD);
//                   setDraftDateFrom(fromStr);
//                   setDraftDateTo(toStr);
//                   dispatch(commitCustomRange({ from: fromStr, to: toStr }));
//                 } else {
//                   dispatch(setDatePreset(v));
//                 }
//               }}
//             >
//               <option value="today">Today</option>
//               <option value="last7">Last 7 days</option>
//               <option value="last30">Last 30 days</option>
//               <option value="custom">Custom range</option>
//             </select>
//             {ui.datePreset === "custom" && (
//               <div className="flex flex-wrap items-center gap-2">
//                 <label className="text-[10px] text-slate-500 uppercase">From</label>
//                 <input
//                   type="date"
//                   className="bg-white border border-slate-200 text-xs px-2 py-1 rounded-lg"
//                   value={draftDateFrom}
//                   onChange={(e) => setDraftDateFrom(e.target.value)}
//                 />
//                 <label className="text-[10px] text-slate-500 uppercase">To</label>
//                 <input
//                   type="date"
//                   className="bg-white border border-slate-200 text-xs px-2 py-1 rounded-lg"
//                   value={draftDateTo}
//                   onChange={(e) => setDraftDateTo(e.target.value)}
//                 />
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setCustomRangeError(null);
//                     if (!draftDateFrom || !draftDateTo) {
//                       setCustomRangeError("Select both start and end dates.");
//                       return;
//                     }
//                     if (draftDateFrom > draftDateTo) {
//                       setCustomRangeError("Start date must be on or before end date.");
//                       return;
//                     }
//                     const start = new Date(draftDateFrom);
//                     const end = new Date(draftDateTo);
//                     const maxMs = 366 * 24 * 60 * 60 * 1000;
//                     if (end - start > maxMs) {
//                       setCustomRangeError("Range cannot exceed 366 days.");
//                       return;
//                     }
//                     dispatch(commitCustomRange({ from: draftDateFrom, to: draftDateTo }));
//                   }}
//                   className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900"
//                 >
//                   Apply
//                 </button>
//               </div>
//             )}
//           </div>
//           </div>
//           {customRangeError && <p className="text-xs text-red-600">{customRangeError}</p>}
//         </div>
//         <div className="flex items-center gap-3">
//           <button
//             type="button"
//             onClick={handleDownloadReport}
//             disabled={!orders.length}
//             className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
//           >
//             Order report
//           </button>
//           <button
//             type="button"
//             className="px-4 py-2 text-xs text-white bg-[#2563eb] rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 opacity-60 cursor-not-allowed"
//             title="Coming soon"
//             disabled
//           >
//             Create a manual order
//           </button>
//         </div>
//       </div>

//       {(summaryIsError || listIsError) && (
//         <ApiErrorBanner error={summaryError || listError} />
//       )}

//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//         {stats.map((stat, i) => (
//           <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
//             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
//               {stat.label}
//             </span>
//             <h3 className="text-2xl font-black text-slate-900 mt-1">
//               {summaryLoading && !summary ? "…" : stat.value}
//             </h3>
//           </div>
//         ))}
//       </div>

//       <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
//         <div className="flex flex-col lg:flex-row items-center justify-between p-2 gap-4 border-b border-slate-100">
//           <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto">
//             {filters.map((f) => (
//               <button
//                 type="button"
//                 key={f.label}
//                 onClick={() => dispatch(setActiveTabLabel(f.label))}
//                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs whitespace-nowrap transition-all ${
//                   ui.activeTabLabel === f.label
//                     ? "bg-blue-50 text-blue-600 border border-blue-200"
//                     : "text-slate-500 hover:bg-slate-50"
//                 }`}
//               >
//                 {f.label}
//                 <span
//                   className={`px-1.5 py-0.5 rounded-md text-[10px] ${
//                     ui.activeTabLabel === f.label ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
//                   }`}
//                 >
//                   {summaryFetching && !summary ? "…" : f.count}
//                 </span>
//               </button>
//             ))}
//           </div>
//           <div className="flex items-center gap-2 w-full lg:w-auto px-2">
//             <input
//               type="search"
//               placeholder="Search orders…"
//               value={ui.searchInput}
//               onChange={(e) => dispatch(setSearchInput(e.target.value))}
//               onKeyDown={(e) => {
//                 if (e.key === "Enter") dispatch(commitSearch());
//               }}
//               className="w-full lg:w-64 pl-4 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
//             />
//             <button
//               type="button"
//               className="text-xs text-slate-500 px-2"
//               onClick={() => dispatch(clearSearch())}
//             >
//               Clear
//             </button>
//           </div>
//         </div>

//         {rowActionFeedback?.text ? (
//           <div
//             className={`mx-3 mt-2 rounded-lg border px-3 py-2 text-xs ${
//               rowActionFeedback.type === "err"
//                 ? "border-red-200 bg-red-50 text-red-800"
//                 : "border-emerald-200 bg-emerald-50 text-emerald-800"
//             }`}
//             role="status"
//           >
//             {rowActionFeedback.text}
//             <button
//               type="button"
//               className="ml-2 text-[10px] underline opacity-80"
//               onClick={() => setRowActionFeedback(null)}
//             >
//               Dismiss
//             </button>
//           </div>
//         ) : null}

//         {selectedOrders.length > 0 && (
//           <div className="flex flex-col gap-2 bg-blue-50 p-3 border-b border-blue-100">
//             <div className="flex flex-wrap items-center gap-3">
//               <div className="relative shrink-0">
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setBulkInlineError(null);
//                     setShowBulkMenu(!showBulkMenu);
//                   }}
//                   disabled={bulkActionsBusy}
//                   className="bg-white border border-blue-200 text-blue-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase flex items-center gap-2 disabled:opacity-50 shadow-sm"
//                 >
//                   Bulk actions ▾
//                 </button>
//                 {showBulkMenu && (
//                   <div className="absolute left-0 top-full mt-1 min-w-[260px] bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
//                     {showBulkPendingActions ? (
//                       <>
//                         <button
//                           type="button"
//                           onClick={handleBulkConfirm}
//                           disabled={bulkActionsBusy || !eligibleBulkConfirmIds.length}
//                           title={
//                             !eligibleBulkConfirmIds.length
//                               ? "Select Pending orders where payment is ready (COD, or online paid / advance rules met). Unpaid online orders are not listed here."
//                               : undefined
//                           }
//                           className="w-full text-left px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:text-slate-400 disabled:cursor-not-allowed"
//                         >
//                           Confirm order(s)
//                         </button>
//                         <button
//                           type="button"
//                           onClick={handleBulkCancel}
//                           disabled={bulkActionsBusy || !eligibleBulkPendingIds.length}
//                           title={
//                             !eligibleBulkPendingIds.length
//                               ? "Select Pending orders to cancel."
//                               : undefined
//                           }
//                           className="w-full text-left px-4 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:text-slate-400 disabled:cursor-not-allowed"
//                         >
//                           Cancel order(s)
//                         </button>
//                       </>
//                     ) : null}
//                     {showBulkFulfillmentActions ? (
//                       <button
//                         type="button"
//                         onClick={handleBulkShipNow}
//                         disabled={bulkActionsBusy || !eligibleBulkShipIds.length}
//                         title={
//                           !eligibleBulkShipIds.length
//                             ? "No selected orders are ready for Ship now (needs Confirmed + no AWB)."
//                             : undefined
//                         }
//                         className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
//                       >
//                         Ship now (Shiprocket)
//                       </button>
//                     ) : null}
//                     {showBulkFulfillmentActions ? (
//                       <button
//                         type="button"
//                         onClick={handleBulkSyncShiprocket}
//                         disabled={bulkActionsBusy || !eligibleBulkSyncIds.length}
//                         title={
//                           !eligibleBulkSyncIds.length
//                             ? "No selected orders have a Shiprocket shipment to refresh."
//                             : "Sync status, pickup date, and SRPID from Shiprocket."
//                         }
//                         className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
//                       >
//                         Refresh Shiprocket (sync + SRPID)
//                       </button>
//                     ) : null}
//                     {showBulkFulfillmentActions ? (
//                       <button
//                         type="button"
//                         onClick={openBulkPickupPanel}
//                         disabled={bulkActionsBusy || !eligibleBulkPickupIds.length}
//                         title={
//                           !eligibleBulkPickupIds.length
//                             ? "No selected orders need pickup scheduling (needs AWB, no pickup booked yet)."
//                             : undefined
//                         }
//                         className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
//                       >
//                         Schedule pickup…
//                       </button>
//                     ) : null}
//                     {showBulkTaxInvoicesZip && (
//                       <button
//                         type="button"
//                         onClick={handleBulkTaxInvoicesZipRequest}
//                         disabled={bulkActionsBusy || !eligibleBulkInvoiceIds.length}
//                         title={
//                           !eligibleBulkInvoiceIds.length
//                             ? "Needs Confirmed (or later) orders in the selection."
//                             : undefined
//                         }
//                         className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
//                       >
//                         Bulk tax invoices (ZIP)
//                       </button>
//                     )}
//                     {showBulkFulfillmentActions ? (
//                       <>
//                         <button
//                           type="button"
//                           onClick={handleBulkManifestsZip}
//                           disabled={bulkActionsBusy || !eligibleBulkManifestIds.length}
//                           title={
//                             !eligibleBulkManifestIds.length
//                               ? "No selected orders can download manifest (needs AWB + shipment ops allow download)."
//                               : undefined
//                           }
//                           className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border-t border-slate-100"
//                         >
//                           Bulk Shiprocket manifests (ZIP)
//                         </button>
//                         <button
//                           type="button"
//                           onClick={handleBulkShippingLabelsZip}
//                           disabled={bulkActionsBusy || !eligibleBulkLabelIds.length}
//                           title={
//                             !eligibleBulkLabelIds.length
//                               ? "No selected orders can download label (needs AWB + shipment ops allow download)."
//                               : undefined
//                           }
//                           className="w-full text-left px-4 py-2 text-xs text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
//                         >
//                           Bulk shipping labels (ZIP)
//                         </button>
//                       </>
//                     ) : null}
//                     {!eligibleBulkShipIds.length &&
//                     !eligibleBulkSyncIds.length &&
//                     !eligibleBulkPickupIds.length &&
//                     !eligibleBulkManifestIds.length &&
//                     !eligibleBulkLabelIds.length && (
//                       <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
//                         No ship, pickup, manifest, or label actions apply to the current selection. Select orders with
//                         Shiprocket shipments and use Refresh Shiprocket to load SRPID.
//                       </p>
//                     )}
//                   </div>
//                 )}
//               </div>
//               <div className="flex-1 min-w-0 text-[11px] leading-snug text-slate-700">
//                 <p>
//                   <span className="font-semibold text-slate-800">{selectedOrders.length}</span>{" "}
//                   {selectedOrders.length === 1 ? "order selected" : "orders selected"}. Tap{" "}
//                   <span className="font-semibold">Bulk actions</span>, then pick an item from the menu.
//                 </p>
//                 <p className="text-slate-600 mt-0.5">
//                   {showBulkPendingActions ? (
//                     <>
//                       Confirm (payment ready):{" "}
//                       <span className="font-semibold text-slate-700">{eligibleBulkConfirmIds.length}</span>
//                       {" · "}
//                       Cancel (pending):{" "}
//                       <span className="font-semibold text-slate-700">{eligibleBulkPendingIds.length}</span>
//                     </>
//                   ) : null}
//                   Ready for ship: <span className="font-semibold text-slate-700">{eligibleBulkShipIds.length}</span>
//                   {" · "}
//                   Refresh Shiprocket:{" "}
//                   <span className="font-semibold text-slate-700">{eligibleBulkSyncIds.length}</span>
//                   {" · "}
//                   Ready for pickup:{" "}
//                   <span className="font-semibold text-slate-700">{eligibleBulkPickupIds.length}</span>
//                   {showBulkTaxInvoicesZip && (
//                     <>
//                       {" · "}
//                       Tax invoice (ZIP):{" "}
//                       <span className="font-semibold text-slate-700">{eligibleBulkInvoiceIds.length}</span>
//                     </>
//                   )}
//                   {showBulkFulfillmentActions && (
//                     <>
//                       {" · "}
//                       Manifest (ZIP):{" "}
//                       <span className="font-semibold text-slate-700">{eligibleBulkManifestIds.length}</span>
//                       {" · "}
//                       Shipping label (ZIP):{" "}
//                       <span className="font-semibold text-slate-700">{eligibleBulkLabelIds.length}</span>
//                     </>
//                   )}
//                   {eligibleBulkShipIds.length === 0 && eligibleBulkPickupIds.length === 0 && (
//                     <span className="text-slate-500"> — Ship / pickup not for these rows at this step.</span>
//                   )}
//                 </p>
//               </div>
//             </div>

//             {bulkInlineError && (
//               <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
//                 {bulkInlineError}
//               </div>
//             )}

//             {bulkFeedback && (
//               <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
//                 <div className="flex flex-wrap items-center justify-between gap-2">
//                   <span>
//                     {bulkFeedback.kind === "confirm"
//                       ? "Bulk confirm"
//                       : bulkFeedback.kind === "cancel"
//                         ? "Bulk cancel"
//                         : bulkFeedback.kind === "ship"
//                           ? "Bulk ship"
//                           : bulkFeedback.kind === "sync"
//                             ? "Bulk Refresh Shiprocket"
//                             : "Bulk pickup"} finished:{" "}
//                     <strong>{bulkFeedback.summary?.completed ?? 0}</strong> completed,{" "}
//                     <strong>{bulkFeedback.summary?.skipped ?? 0}</strong> skipped,{" "}
//                     <strong>{bulkFeedback.summary?.failed ?? 0}</strong> failed (of {bulkFeedback.summary?.total ?? 0}
//                     ).
//                     {bulkFeedback.kind === "sync" && bulkFeedback.summary?.pickupIdsSaved != null ? (
//                       <>
//                         {" "}
//                         SRPID saved: <strong>{bulkFeedback.summary.pickupIdsSaved}</strong>.
//                       </>
//                     ) : null}
//                     {bulkFeedback.extraSkipped > 0
//                       ? ` ${bulkFeedback.extraSkipped} selected row(s) were not sent (ineligible).`
//                       : ""}
//                   </span>
//                   <button
//                     type="button"
//                     className="text-[10px] font-semibold text-emerald-800 underline"
//                     onClick={() => setBulkFeedback(null)}
//                   >
//                     Dismiss
//                   </button>
//                 </div>
//                 {Array.isArray(bulkFeedback.results) &&
//                   bulkFeedback.results.some((r) => r && !r.success && !r.skipped) && (
//                     <details className="mt-1">
//                       <summary className="cursor-pointer text-[11px] font-semibold text-emerald-900">
//                         View failed rows
//                       </summary>
//                       <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-[11px] text-slate-700 list-disc pl-4">
//                         {bulkFeedback.results
//                           .filter((r) => r && !r.success && !r.skipped)
//                           .map((r) => (
//                             <li key={r.orderId}>
//                               <span className="font-mono">{r.orderId}</span>: {r.message || r.code || "Error"}
//                             </li>
//                           ))}
//                       </ul>
//                     </details>
//                   )}
//               </div>
//             )}

//             {bulkPickupPanelOpen && (
//               <div className="flex flex-wrap items-end gap-3 rounded-lg border border-blue-200 bg-white/80 p-3">
//                 <div className="flex flex-col gap-1">
//                   <label className="text-[10px] font-bold uppercase text-slate-500">Pickup date</label>
//                   {bulkPickupCalendarRes?.preferences?.hasScheduleRules ? (
//                     <p className="text-[10px] text-slate-500 max-w-xs">
//                       Dates follow your Shiprocket panel schedule.
//                     </p>
//                   ) : bulkPickupCalendarRes?.scheduleRulesMessage ? (
//                     <p className="text-[10px] text-amber-800 max-w-xs">
//                       {bulkPickupCalendarRes.scheduleRulesMessage}
//                     </p>
//                   ) : null}
//                   {bulkPickupCalendarRes?.preferences?.hasScheduleRules && bulkPickupAllowedDates.length > 0 ? (
//                     <select
//                       value={
//                         bulkPickupAllowedDates.includes(bulkPickupDate)
//                           ? bulkPickupDate
//                           : bulkPickupAllowedDates[0]
//                       }
//                       onChange={(e) => setBulkPickupDate(e.target.value)}
//                       className="bg-white border border-slate-200 text-xs px-2 py-1.5 rounded-lg min-w-[11rem]"
//                     >
//                       {bulkPickupAllowedDates.map((d) => (
//                         <option key={d} value={d}>
//                           {d}
//                         </option>
//                       ))}
//                     </select>
//                   ) : (
//                     <input
//                       type="date"
//                       min={toLocalYmd(new Date())}
//                       value={bulkPickupDate}
//                       onChange={(e) => setBulkPickupDate(e.target.value)}
//                       className="bg-white border border-slate-200 text-xs px-2 py-1.5 rounded-lg"
//                     />
//                   )}
//                 </div>
//                 <button
//                   type="button"
//                   onClick={handleBulkSchedulePickupRun}
//                   disabled={bulkActionsBusy || !eligibleBulkPickupIds.length || !bulkPickupDate}
//                   className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50"
//                 >
//                   Schedule pickup ({eligibleBulkPickupIds.length})
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => setBulkPickupPanelOpen(false)}
//                   className="px-3 py-1.5 text-xs text-slate-600 hover:underline"
//                 >
//                   Cancel
//                 </button>
//               </div>
//             )}
//           </div>
//         )}

//         {(listLoading || listFetching) && orders.length === 0 && (
//           <p className="p-8 text-center text-sm text-slate-500">Loading orders…</p>
//         )}

//         <div className="overflow-x-auto">
//           <table className="w-full text-left border-collapse">
//             <thead className="bg-[#F8FAFC] border-b border-slate-200">
//               <tr className="text-[11px] text-slate-900 uppercase tracking-tight">
//                 <th className="px-4 py-4 w-10">
//                   <input
//                     type="checkbox"
//                     className="rounded border-slate-300"
//                     onChange={toggleSelectAll}
//                     checked={orders.length > 0 && selectedOrders.length === orders.length}
//                   />
//                 </th>
//                 <th className="px-4 py-4 text-[#2563eb]">Order ID</th>
//                 <th className="px-4 py-4 text-[#2563eb]">Contact</th>
//                 <th className="px-4 py-4 text-[#2563eb]">Date</th>
//                 <th className="px-4 py-4 text-[#2563eb] text-right">Amount</th>
//                 <th className="px-4 py-4 text-[#2563eb] text-center">Status</th>
//                 <th className="px-4 py-4 text-[#2563eb]">Courier &amp; ops</th>
//                 <th className="px-4 py-4 text-[#2563eb] text-center">Action</th>
//                 <th className="px-4 py-4 text-[#2563eb] text-center">Items</th>
//                 <th className="px-4 py-4 text-[#2563eb] text-center">Payment</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-100 bg-white">
//               {orders.map((order) => (
//                 <tr
//                   key={order.orderId}
//                   onClick={() => setSelectedOrderId(order.orderId)}
//                   className={`hover:bg-blue-50/30 transition-colors text-[13px] text-slate-700 cursor-pointer ${
//                     selectedOrders.includes(order.orderId) ? "bg-blue-50/40" : ""
//                   }`}
//                 >
//                   <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
//                     <input
//                       type="checkbox"
//                       className="rounded border-slate-300"
//                       checked={selectedOrders.includes(order.orderId)}
//                       onChange={() => toggleSelectOrder(order.orderId)}
//                     />
//                   </td>
//                   <td className="px-4 py-4 text-slate-900 font-medium">
//                     <div>{order.orderIdDisplay || order.orderId}</div>
//                     {order.shiprocketPickupIdDisplay ? (
//                       <p className="text-[10px] font-semibold text-indigo-600 mt-0.5 tracking-wide">
//                         {order.shiprocketPickupIdDisplay}
//                       </p>
//                     ) : null}
//                   </td>
//                   <td className="px-4 py-4 font-medium text-slate-500">{order.contactPhone || "—"}</td>
//                   <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
//                     {formatDateTime(order.createdAt)}
//                   </td>
//                   <td className="px-4 py-4 text-slate-900 text-right">{formatInr(order.amountInr)}</td>
//                   <td className="px-4 py-4 text-center">
//                     <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs font-semibold">
//                       {order.fulfillmentLabel || "—"}
//                     </span>
//                   </td>
//                   <td className="px-4 py-4 min-w-[10rem]">
//                     <p className="text-xs font-semibold text-slate-800 leading-snug">
//                       {order.courierOpsLine1 || "—"}
//                     </p>
//                     {order.courierOpsLine2 ? (
//                       <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{order.courierOpsLine2}</p>
//                     ) : null}
//                   </td>
//                   <td className="px-4 py-4 text-center relative overflow-visible">
//                     <AdminOrderRowActions
//                       order={order}
//                       onOpenDetail={setSelectedOrderId}
//                       onFeedback={(fb) => {
//                         if (fb?.type === "err" && fb.text) {
//                           setRowActionFeedback({ type: "err", text: fb.text });
//                         } else if (fb?.type === "ok") {
//                           setRowActionFeedback({
//                             type: "ok",
//                             text: "Action completed. List will refresh automatically.",
//                           });
//                         }
//                       }}
//                     />
//                   </td>
//                   <td className="px-4 py-4 text-center">{order.itemCount}</td>
//                   <td className="px-4 py-4 text-center">
//                     <span className="text-emerald-700 text-xs font-medium">{order.paymentLabel}</span>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>

//         {pagination && pagination.total > 0 && (
//           <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
//             <span>
//               Page {pagination.page} of {pagination.totalPages || 1} · {pagination.total} orders
//             </span>
//             <div className="flex gap-2">
//               <button
//                 type="button"
//                 disabled={!pagination.hasPrevPage}
//                 onClick={() => dispatch(setPage(pagination.page - 1))}
//                 className="px-3 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
//               >
//                 Previous
//               </button>
//               <button
//                 type="button"
//                 disabled={!pagination.hasNextPage}
//                 onClick={() => dispatch(setPage(pagination.page + 1))}
//                 className="px-3 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
//               >
//                 Next
//               </button>
//             </div>
//           </div>
//         )}

//         {!listLoading && orders.length === 0 && !listIsError && (
//           <p className="p-8 text-center text-sm text-slate-500">No orders in this range / filter.</p>
//         )}
//       </div>

//       {bulkInvoiceAwbModalOpen && (
//         <div
//           className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
//           role="dialog"
//           aria-modal="true"
//           aria-labelledby="bulk-invoice-awb-title"
//         >
//           <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-slate-200">
//             <h2 id="bulk-invoice-awb-title" className="text-sm font-bold text-slate-900">
//               Some selected orders have no AWB yet
//             </h2>
//             <p className="mt-2 text-xs text-slate-600 leading-relaxed">
//               The invoice can still be generated; the AWB / courier block will stay empty until tracking exists. Choose{" "}
//               <strong>Yes</strong> to download the ZIP for all eligible selected orders anyway, or <strong>No</strong> to
//               cancel and run <strong>Ship now</strong> first where you need AWBs filled in.
//             </p>
//             <p className="mt-2 text-[11px] text-slate-500">
//               {invoiceSelectionMissingAwb} of {eligibleBulkInvoiceIds.length} invoice-eligible selected order(s) are
//               missing AWB.
//             </p>
//             <div className="mt-4 flex flex-wrap justify-end gap-2">
//               <button
//                 type="button"
//                 className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
//                 onClick={() => setBulkInvoiceAwbModalOpen(false)}
//               >
//                 No, cancel
//               </button>
//               <button
//                 type="button"
//                 className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-900"
//                 onClick={() => void runBulkTaxInvoicesZipDownload()}
//               >
//                 Yes, download ZIP
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default OrderTab;
