/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import wholesaleAxios from "../../../../SERVICES/Wholesaleaxios";
import {
  useAdminBulkApprovalCancelMutation,
  useAdminBulkApprovalConfirmMutation,
  useAdminFulfillmentAssignShipMutation,
  useAdminFulfillmentCancelShipmentMutation,
  useAdminFulfillmentEnsureShipmentMutation,
  useAdminFulfillmentManifestMutation,
  useAdminFulfillmentRetryPickupMutation,
  useAdminFulfillmentSchedulePickupMutation,
  useAdminFulfillmentSyncShiprocketMutation,
  useAdminFulfillmentShippingLabelMutation,
  useGetAdminPickupCalendarQuery,
} from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersApi";
import { isPostConfirmOrderStatus } from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersSlice";
import AdminPendingOrderEditPanel from "./AdminPendingOrderEditPanel";
import AdminPendingAddressPanel from "./AdminPendingAddressPanel";
import OrderShipmentTrackingPanel from "./OrderShipmentTrackingPanel";
import OrderPaymentSummaryCard from "./OrderPaymentSummaryCard";

/** @deprecated Prefer shipmentOps.opsState — kept for legacy sync heuristics only. */
function isPickupBookedOnOrder(ship, opsState) {
  if (opsState === "AWB_ASSIGNED" || opsState === "READY_TO_SHIP" || opsState === "PROVIDER_RESET") {
    return false;
  }
  if (["PICKUP_SCHEDULED", "MANIFEST_READY", "LABEL_READY"].includes(opsState)) {
    return true;
  }
  if (!ship) return false;
  if (ship.providerSnapshot?.pickupScheduled === false) return false;
  const st = String(ship.providerStatus || "");
  if (/pickup\s*scheduled|pickup\s*queue|manifest/i.test(st)) return true;
  if (ship.pickupDate || ship.pickupScheduledAt) return true;
  return false;
}

const FULFILLMENT_PRIMARY_ACTION_LABELS = {
  shipNow: "Ship now",
  schedulePickup: "Schedule pickup",
  generateManifest: "Generate manifest",
  downloadManifest: "Download manifest",
  downloadLabel: "Download label",
  syncShiprocket: "Refresh Shiprocket",
  refreshTracking: "Refresh tracking",
  retryPickup: "Retry pickup",
  cancelShipment: "Cancel on Shiprocket",
};

const EXCEPTION_OPS_STATES = new Set([
  "PICKUP_EXCEPTION",
  "PROVIDER_RESET",
  "NEEDS_MANUAL_REVIEW",
]);

function resolveShippingProviderKey(order) {
  return String(order?.shippingProvider || order?.shipmentInfo?.provider || "shiprocket").toLowerCase() ===
    "shipmozo"
    ? "shipmozo"
    : "shiprocket";
}

function removedArchiveBadge(reason) {
  if (reason === "qty_reduced") return "Qty reduced";
  if (reason === "order_cancelled_empty") return "Removed — order cancelled";
  return "Removed — unavailable";
}

function resolveShiprocketSupportUrl(externalLinks) {
  return (
    externalLinks?.shiprocketSupportUrl ||
    externalLinks?.createTicketUrl ||
    externalLinks?.shiprocketOrderUrl ||
    "https://app.shiprocket.in/seller/support"
  );
}

function buildShiprocketSupportClipboardText({ orderId, ship, ops }) {
  const lines = [
    `Order: ${orderId || "—"}`,
    `Shiprocket order ID: ${ship?.shiprocketOrderId || "—"}`,
    `AWB: ${ship?.awbCode || ship?.trackingNumber || "—"}`,
    `Courier: ${ship?.courier || "—"}`,
    `Provider status: ${ship?.providerStatus || ops?.providerStatusRaw || "—"}`,
    `Ops state: ${ops?.opsStateLabel || ops?.opsState || "—"}`,
  ];
  return lines.join("\n");
}

function formatSrpidDisplay(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^SRPID-/i.test(s)) return s.toUpperCase();
  const digits = s.replace(/\D/g, "");
  return digits ? `SRPID-${digits}` : `SRPID-${s}`;
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatKg(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} kg`;
}

const DIM_WEIGHT_DIVISOR = 5000;

function formatPackageDims(dims) {
  if (!dims || typeof dims !== "object") return null;
  const l = Number(dims.lengthCm);
  const w = Number(dims.widthCm);
  const h = Number(dims.heightCm);
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) return null;
  return `${l} × ${w} × ${h} cm`;
}

function dimWeightKgFromDims(dims) {
  if (!dims || typeof dims !== "object") return null;
  const l = Number(dims.lengthCm);
  const w = Number(dims.widthCm);
  const h = Number(dims.heightCm);
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) return null;
  return Math.round(((l * w * h) / DIM_WEIGHT_DIVISOR) * 100) / 100;
}

function formatDateHeader(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Matches `Order.orderStatus` enum in the schema (human-readable). */
const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  payment_failed: "Payment failed",
};

/** Matches `Order.paymentStatus` enum. */
const PAYMENT_STATUS_LABELS = {
  pending: "Pending",
  initiated: "Initiated",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partially_paid: "Partially paid",
  partially_refunded: "Partially refunded",
};

function isShiprocketRtoStatus(orderStatus, providerStatus) {
  const st = String(orderStatus || "").toLowerCase();
  const ps = String(providerStatus || "").trim();
  if (st === "rto") return true;
  return /\brto\b/i.test(ps) || /return to origin/i.test(ps);
}

function labelOrderStatus(raw, providerStatus) {
  if (isShiprocketRtoStatus(raw, providerStatus)) {
    const ps = String(providerStatus || "").trim();
    return ps || "RTO";
  }
  const k = String(raw || "").trim();
  if (ORDER_STATUS_LABELS[k]) return ORDER_STATUS_LABELS[k];
  return k ? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
}

function labelPaymentStatus(raw) {
  const k = String(raw || "").trim();
  if (PAYMENT_STATUS_LABELS[k]) return PAYMENT_STATUS_LABELS[k];
  return k ? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
}

function statusBadgeClass(orderStatus, providerStatus) {
  const s = String(orderStatus || "").toLowerCase();
  if (isShiprocketRtoStatus(s, providerStatus)) {
    return "bg-orange-50 text-orange-800 border-orange-200";
  }
  if (["delivered", "confirmed"].includes(s)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["shipped", "out_for_delivery", "processing"].includes(s)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["pending", "return_requested"].includes(s)) return "bg-amber-50 text-amber-800 border-amber-200";
  if (["cancelled", "payment_failed"].includes(s)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function paymentBadgeClass(paymentStatus) {
  const s = String(paymentStatus || "").toLowerCase();
  if (s === "paid") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "partially_paid") return "bg-amber-50 text-amber-800 border-amber-200";
  if (["failed", "refunded", "partially_refunded"].includes(s)) return "bg-red-50 text-red-700 border-red-200";
  if (["pending", "initiated"].includes(s)) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function paymentMethodLabel(order) {
  const m = order?.paymentInfo?.method;
  if (String(m || "").toLowerCase() === "cod") return "Cash on delivery (COD)";
  if (m === "online") return "Online (Razorpay)";
  return m ? String(m) : "—";
}

function normalizeTrackingEvents(rawEvents = []) {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .map((event, idx) => ({
      id: `${idx}-${String(event?.status || event?.description || "event")}`,
      status: event?.status || "Shipment update",
      description: event?.description || null,
      location: event?.location || null,
      timestamp: event?.timestamp || event?.at || null,
    }))
    .filter((event) => event.status || event.description || event.timestamp);
}

function timelineRowsFromTracking(tracking) {
  const events = Array.isArray(tracking?.timeline) ? tracking.timeline : [];
  return events.map((event, idx) => ({
    id: `tl-${idx}-${String(event?.status || "step")}`,
    status: event?.status || "Shipment update",
    description: event?.description || null,
    location: event?.location || null,
    timestamp: event?.timestamp || null,
  }));
}

function localYmdTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * When GET /orders/items/:id includes `fulfillmentPaymentGate` (staff), use it.
 * Fallback for older API responses: conservative — COD or fully paid, or advance+COD with capture.
 */
function carrierFulfilmentPaymentReady(order, gateFromApi) {
  if (gateFromApi != null) return Boolean(gateFromApi.ok);
  if (!order) return false;
  const method = String(order?.paymentInfo?.method || "").toLowerCase();
  if (method === "cod") return true;
  const pay = String(order?.paymentStatus || "").toLowerCase();
  // Keep in sync with backend orderFulfillmentPaymentGate: paid + shippable partial refunds.
  if (pay === "paid") return true;
  if (
    pay === "partially_refunded" &&
    Number(order?.totalAmount || 0) > 0.01 &&
    Number(order?.amountPaidInr || 0) > 0.01
  ) {
    return true;
  }
  const split = String(order?.paymentInfo?.splitMode || "").toLowerCase();
  const bc = String(order?.paymentInfo?.balanceCollectionMethod || "").toLowerCase();
  if (
    (method === "online" || method === "prepaid") &&
    split === "advance" &&
    bc === "cod" &&
    pay === "partially_paid" &&
    Number(order?.amountPaidInr || 0) > 0.01
  ) {
    return true;
  }
  return false;
}

/** RTK mutation / axios-style errors from adminOrdersApi */
function fulfillmentActionErrorText(e, fallback = "Request failed.") {
  const d = e?.data;
  if (typeof d === "object" && d && d.message) return String(d.message);
  if (typeof d === "string" && d.trim()) return d;
  if (e?.message && String(e.message).trim()) return String(e.message);
  return fallback;
}

function pickupScheduleFeedback({ response, selectedDate }) {
  const r = response || {};
  const selected = String(selectedDate || "").trim();
  const saved = String(r.pickupDate || "").trim();
  if (r.alreadyScheduled && saved && selected && saved !== selected) {
    return {
      type: "warn",
      text:
        r.message ||
        `Shiprocket already has pickup on ${saved}. You selected ${selected}. Confirm on the Shiprocket panel.`,
    };
  }
  if (r.alreadyScheduled && r.shipmentOps?.actionCapabilities?.schedulePickup) {
    return {
      type: "warn",
      text:
        r.message ||
        "Shiprocket reports pickup exists, but this order still needs scheduling. Try Schedule pickup again or refresh from Shiprocket.",
    };
  }
  return {
    type: "ok",
    text:
      r.message ||
      (saved ? `Pickup scheduled for ${saved}.` : "Pickup scheduled on Shiprocket."),
  };
}

function FulfillmentStatusBanner({ msg, providerLabel = "Shipping" }) {
  if (!msg?.text) return null;
  const tone =
    msg.type === "err"
      ? "bg-red-50 text-red-800 border-red-100"
      : msg.type === "warn"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-blue-50 text-blue-900 border-blue-100";
  return (
    <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm border ${tone}`} role="status" aria-live="polite">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        {providerLabel} status
      </p>
      {msg.text}
    </div>
  );
}

function FulfillmentStepCard({
  step,
  focusStep,
  done,
  title,
  heading,
  children,
  id,
  isLast = false,
  /** When true, only render if this step is locked (for accordion). */
  onlyIfLocked = false,
  /** When true (default), hide locked steps from the main timeline. */
  hideIfLocked = true,
}) {
  const isActive = step === focusStep && !done;
  const locked = !done && !isActive && Number(step) > Number(focusStep);
  if (onlyIfLocked && !locked) return null;
  if (hideIfLocked && locked && !onlyIfLocked) return null;

  const circleClass = done
    ? "border-blue-600 bg-blue-600 text-white"
    : isActive
      ? "border-blue-600 bg-white"
      : "border-slate-300 bg-white";

  return (
    <div className={`relative flex gap-3 ${locked ? "opacity-70" : ""}`} id={id}>
      <div className="flex w-5 shrink-0 flex-col items-center">
        <span
          className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 ${circleClass}`}
          aria-current={isActive ? "step" : undefined}
        >
          {done ? (
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : isActive ? (
            <span className="h-2 w-2 rounded-full bg-blue-600" />
          ) : null}
        </span>
        {!isLast ? <span className="mt-1 w-px flex-1 min-h-[1.25rem] bg-slate-200" aria-hidden /> : null}
      </div>
      <div
        className={`min-w-0 flex-1 border px-3 py-2.5 mb-2 rounded-md ${
          isActive
            ? "border-blue-300 bg-blue-50/50"
            : done
              ? "border-slate-200 bg-slate-50/40"
              : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
            {heading ? <p className="text-sm font-bold text-slate-900 mt-0.5">{heading}</p> : null}
          </div>
          {done ? (
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">
              Done
            </span>
          ) : isActive ? (
            <span className="text-[9px] font-bold uppercase tracking-wide text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md shrink-0">
              Action required
            </span>
          ) : locked ? (
            <span className="text-[9px] font-semibold italic text-slate-400 shrink-0">Locked</span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Rich admin order detail — data-driven from GET /orders/items/:orderId (staff sees customer + SKUs).
 */
export default function AdminOrderDetailView({
  orderId,
  order,
  /** From staff GET /orders/items/:id — server-evaluated payment gate for Shiprocket */
  fulfillmentPaymentGate,
  tracking,
  trackingLoading,
  trackingError,
  onRefreshTracking,
  onOrderRefresh,
  loading,
  error,
  onBack,
}) {
  const [pickupDate, setPickupDate] = useState(localYmdTomorrow);
  const [actionMsg, setActionMsg] = useState(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [labelDownloadBusy, setLabelDownloadBusy] = useState(false);
  const [manifestDownloadBusy, setManifestDownloadBusy] = useState(false);

  const { data: pickupCalendarRes } = useGetAdminPickupCalendarQuery({ daysAhead: 45 });
  const pickupCalendar = pickupCalendarRes?.calendar;
  const pickupAllowedDates = useMemo(
    () => (Array.isArray(pickupCalendar?.allowedDates) ? pickupCalendar.allowedDates : []),
    [pickupCalendar?.allowedDates]
  );
  const pickupUsesShiprocketRules = Boolean(pickupCalendarRes?.preferences?.hasScheduleRules);

  const [ensureShipment, ensureState] = useAdminFulfillmentEnsureShipmentMutation();
  const [assignShip, assignState] = useAdminFulfillmentAssignShipMutation();
  const [schedulePickup, pickupState] = useAdminFulfillmentSchedulePickupMutation();
  const [syncShiprocket, syncShiprocketState] = useAdminFulfillmentSyncShiprocketMutation();
  const [fulfillmentManifest, manifestState] = useAdminFulfillmentManifestMutation();
  const [, labelState] = useAdminFulfillmentShippingLabelMutation();
  const [cancelShipment, cancelState] = useAdminFulfillmentCancelShipmentMutation();
  const [retryPickup, retryPickupState] = useAdminFulfillmentRetryPickupMutation();
  const [bulkConfirm, bulkConfirmState] = useAdminBulkApprovalConfirmMutation();
  const [bulkCancel, bulkCancelState] = useAdminBulkApprovalCancelMutation();

  const refreshOrder = useCallback(async () => {
    if (typeof onOrderRefresh === "function") {
      await onOrderRefresh();
    }
  }, [onOrderRefresh]);

  const syncedOnOpenRef = useRef(null);
  useEffect(() => {
    syncedOnOpenRef.current = null;
    window.scrollTo({ top: 0, behavior: "instant" });
    const mainEl = document.querySelector("main.overflow-y-auto");
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [orderId]);

  useEffect(() => {
    const def = pickupCalendar?.defaultDate;
    if (def && pickupAllowedDates.includes(def)) {
      setPickupDate(def);
    }
  }, [pickupCalendar?.defaultDate, pickupAllowedDates]);

  const fulfillmentBusy =
    ensureState.isLoading ||
    assignState.isLoading ||
    pickupState.isLoading ||
    manifestState.isLoading ||
    syncShiprocketState.isLoading ||
    labelState.isLoading ||
    cancelState.isLoading ||
    retryPickupState.isLoading ||
    bulkConfirmState.isLoading ||
    bulkCancelState.isLoading;

  const orderSt = String(order?.orderStatus || "").toLowerCase();
  const shippingProviderKey = resolveShippingProviderKey(order);
  const isShipmozo = shippingProviderKey === "shipmozo";
  const providerName = isShipmozo ? "Shipmozo" : "Shiprocket";
  const paySt = String(order?.paymentStatus || "").toLowerCase();
  const moneyCaptured =
    (paySt === "paid" || paySt === "partially_paid") && Number(order?.amountPaidInr || 0) > 0.01;
  const shiprocketProviderStatus = order?.shipmentInfo?.providerStatus || "";
  const isRtoOrder = isShiprocketRtoStatus(orderSt, shiprocketProviderStatus);
  const isPendingOrder = orderSt === "pending";
  const showInvoiceAndLogistics = isPostConfirmOrderStatus(orderSt);
  // Never block fulfilment solely on payment_failed when Razorpay already captured money.
  const unpaidTerminalStatus =
    (orderSt === "cancelled" || orderSt === "payment_failed") && !moneyCaptured;
  const fulfillmentActionsBlocked = unpaidTerminalStatus || isRtoOrder;
  const fulfillmentBlockMessage = fulfillmentActionsBlocked
    ? isRtoOrder
      ? `${providerName} reports: ${String(shiprocketProviderStatus || "RTO").trim()}. Forward shipment actions are not available during return-to-origin.`
      : orderSt === "cancelled"
      ? `This order was cancelled. Ship now, pickup scheduling, shipping labels, and other ${providerName} shipment actions are not available.`
      : `The customer did not complete payment. ${providerName} fulfilment actions are not available.`
    : null;

  const carrierPaymentReady = carrierFulfilmentPaymentReady(order, fulfillmentPaymentGate);
  const canRunFulfillmentActions = !fulfillmentActionsBlocked && carrierPaymentReady;
  const carrierPaymentHint =
    fulfillmentActionsBlocked
      ? null
      : fulfillmentPaymentGate && fulfillmentPaymentGate.ok === false
        ? fulfillmentPaymentGate.message
        : !carrierPaymentReady
          ? `Waiting for customer payment (or COD rules) before ${providerName} actions.`
          : null;

  useEffect(() => {
    if (!orderId || !order || loading) return;
    const srId = order?.shipmentInfo?.shiprocketOrderId;
    if (!srId || fulfillmentActionsBlocked) return;
    if (syncedOnOpenRef.current === orderId) return;

    const opsState = order?.shipmentOps?.opsState;
    const syncHealth = order?.shipmentOps?.syncHealth;
    const capsSchedule = order?.shipmentOps?.actionCapabilities?.schedulePickup;
    const si = order?.shipmentInfo || {};
    const stalePickup = Boolean(si.pickupDate) && (opsState === "AWB_ASSIGNED" || capsSchedule);
    const needsSync =
      syncHealth === "stale" ||
      syncHealth === "unknown" ||
      syncHealth === "error" ||
      stalePickup;

    if (!needsSync) {
      syncedOnOpenRef.current = orderId;
      return;
    }

    syncedOnOpenRef.current = orderId;
    let cancelled = false;
    (async () => {
      try {
        await syncShiprocket(orderId).unwrap();
        if (!cancelled) {
          await refreshOrder();
          if (typeof onRefreshTracking === "function") await onRefreshTracking();
        }
      } catch {
        /* ignore background sync errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orderId,
    order,
    loading,
    fulfillmentActionsBlocked,
    syncShiprocket,
    refreshOrder,
    onRefreshTracking,
  ]);

  const fetchInvoiceObjectUrl = useCallback(async () => {
    const res = await wholesaleAxios.get(
      `/orders/admin/items/${encodeURIComponent(String(orderId))}/invoice-html`,
      { responseType: "text", headers: { Accept: "text/html" } }
    );
    const blob = new Blob([res.data], { type: "text/html;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [orderId]);

  const invoiceErrorMessage = (e) =>
    e?.response?.data?.message ||
    (typeof e?.response?.data === "string" ? e.response.data : null) ||
    e?.message ||
    "Could not load invoice.";

  const printTaxInvoice = useCallback(async () => {
    if (!orderId) return;
    setActionMsg(null);
    setInvoiceBusy(true);
    let url;
    try {
      url = await fetchInvoiceObjectUrl();
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) {
        URL.revokeObjectURL(url);
        setActionMsg({
          type: "err",
          text: "Pop-up blocked — allow pop-ups for this site to print the invoice.",
          surface: "invoice",
        });
        return;
      }
      const runPrint = () => {
        try {
          w.focus();
          w.print();
        } catch {
          /* ignore */
        }
      };
      w.addEventListener("load", runPrint, { once: true });
      if (w.document?.readyState === "complete") {
        setTimeout(runPrint, 0);
      }
      setTimeout(() => URL.revokeObjectURL(url), 180000);
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      setActionMsg({ type: "err", text: invoiceErrorMessage(e), surface: "invoice" });
    } finally {
      setInvoiceBusy(false);
    }
  }, [orderId, fetchInvoiceObjectUrl]);

  const fetchShippingLabelBlob = useCallback(async () => {
    const res = await wholesaleAxios.get(
      `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/shipping-label-file`,
      { responseType: "blob" }
    );
    if (res.headers["content-type"]?.includes("application/json")) {
      const t = await res.data.text();
      const j = JSON.parse(t);
      throw new Error(j?.message || "Label fetch failed.");
    }
    const rawCt = String(res.headers["content-type"] || "application/pdf").split(";")[0].trim();
    return {
      blob: new Blob([res.data], { type: rawCt || "application/pdf" }),
      filename: (() => {
        const isSm =
          String(order?.shippingProvider || order?.shipmentInfo?.provider || "")
            .toLowerCase() === "shipmozo";
        let filename = `${isSm ? "Shipmozo" : "Shiprocket"}-label-${String(orderId)
          .replace(/[^\w.-]+/g, "_")
          .slice(0, 80)}.pdf`;
        const dispo = res.headers["content-disposition"];
        if (dispo) {
          const m = /filename\*?=(?:UTF-8''|"?)([^";\n]+)/i.exec(dispo);
          if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, "").trim());
        }
        return filename;
      })(),
    };
  }, [orderId, order?.shippingProvider, order?.shipmentInfo?.provider]);

  const openShippingLabelInNewTab = useCallback(async () => {
    if (!orderId) return;
    setActionMsg(null);
    setLabelDownloadBusy(true);
    let objectUrl;
    try {
      const { blob } = await fetchShippingLabelBlob();
      objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      const pname =
        String(order?.shippingProvider || order?.shipmentInfo?.provider || "")
          .toLowerCase() === "shipmozo"
          ? "Shipmozo"
          : "Shiprocket";
      setActionMsg({ type: "ok", text: `Opening ${pname} shipping label.`, surface: "label" });
      await refreshOrder();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 180000);
    } catch (e) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setActionMsg({
        type: "err",
        text: e?.message || "Could not open shipping label.",
        surface: "label",
      });
    } finally {
      setLabelDownloadBusy(false);
    }
  }, [orderId, order?.shippingProvider, order?.shipmentInfo?.provider, fetchShippingLabelBlob, refreshOrder]);

  const downloadShippingLabelFile = useCallback(async () => {
    if (!orderId) return;
    setActionMsg(null);
    setLabelDownloadBusy(true);
    try {
      const { blob, filename } = await fetchShippingLabelBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setActionMsg({ type: "ok", text: "Shipping label file downloaded.", surface: "label" });
      await refreshOrder();
    } catch (e) {
      let msg = e?.message || "Label download failed.";
      if (e?.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          if (j?.message) msg = j.message;
        } catch {
          /* ignore */
        }
      } else if (e?.response?.data && typeof e.response.data === "object" && e.response.data.message) {
        msg = e.response.data.message;
      }
      setActionMsg({ type: "err", text: msg, surface: "label" });
    } finally {
      setLabelDownloadBusy(false);
    }
  }, [orderId, fetchShippingLabelBlob, refreshOrder]);

  const downloadManifestFile = useCallback(async () => {
    if (!orderId) return;
    setActionMsg(null);
    setManifestDownloadBusy(true);
    try {
      const res = await wholesaleAxios.get(
        `/orders/admin/items/${encodeURIComponent(String(orderId))}/fulfillment/manifest-file`,
        { responseType: "blob" }
      );
      let filename = `Shiprocket-manifest-${String(orderId).replace(/[^\w.-]+/g, "_").slice(0, 80)}.pdf`;
      const dispo = res.headers["content-disposition"];
      if (dispo) {
        const m = /filename\*?=(?:UTF-8''|"?)([^";\n]+)/i.exec(dispo);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, "").trim());
      }
      const blob = new Blob([res.data], { type: res.headers["content-type"] || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setActionMsg({ type: "ok", text: "Manifest downloaded.", surface: "manifest" });
      await refreshOrder();
    } catch (e) {
      let msg = e?.message || "Manifest download failed.";
      if (e?.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          if (j?.message) msg = j.message;
        } catch {
          /* ignore */
        }
      } else if (e?.response?.data?.message) {
        msg = e.response.data.message;
      }
      setActionMsg({ type: "err", text: msg, surface: "manifest" });
    } finally {
      setManifestDownloadBusy(false);
    }
  }, [orderId, refreshOrder]);

  const ship = order?.shipmentInfo || {};
  const ops = order?.shipmentOps || {};
  const caps = ops.actionCapabilities || {};
  const blockReasons = ops.blockReasons || {};
  const riskFlags = ops.riskFlags || {};
  const externalLinks = ops.externalLinks || {};
  const hasCarrierAwb = Boolean(ship.awbCode || ship.trackingNumber);
  const shipmozoNeedsManualPickup = isShipmozo && ship.shipmozoNeedsManualPickup === true;
  const shipmozoAutoPickup =
    isShipmozo && hasCarrierAwb && !shipmozoNeedsManualPickup && !caps.schedulePickup;
  const pickupAlreadyScheduled =
    ops.opsState === "PICKUP_SCHEDULED" ||
    ops.opsState === "MANIFEST_READY" ||
    ops.opsState === "LABEL_READY" ||
    ops.opsState === "IN_TRANSIT" ||
    ops.opsState === "OUT_FOR_DELIVERY" ||
    ops.opsState === "DELIVERED" ||
    shipmozoAutoPickup ||
    (ops.opsState === "LABEL_READY" && !caps.schedulePickup);
  /** Shipmozo: skip Shiprocket-style manifest; show pickup only when manual schedule is required. */
  const showPickupStep = !isShipmozo || shipmozoNeedsManualPickup || Boolean(caps.schedulePickup);
  const showManifestStep = !isShipmozo;
  const showOpsAlert =
    Boolean(ops.nextStepMessage) &&
    (riskFlags.pickupException || riskFlags.providerReset || riskFlags.needsManualReview);
  const isExceptionOpsState = EXCEPTION_OPS_STATES.has(ops.opsState);
  const showStandardFulfillmentSteps = !isExceptionOpsState;
  const showReshipStepOnly = ops.opsState === "PROVIDER_RESET";
  const canCancelShipment = Boolean(
    caps.cancelShipment &&
      (isShipmozo
        ? ship.shipmozoOrderId || ship.shipmentId || hasCarrierAwb
        : ship.shiprocketOrderId)
  );

  const copySupportContext = useCallback(async () => {
    const text = isShipmozo
      ? [
          `Order: ${orderId || "—"}`,
          `Shipmozo order ID: ${ship?.shipmozoOrderId || ship?.shipmentId || "—"}`,
          `AWB: ${ship?.awbCode || ship?.trackingNumber || "—"}`,
          `Courier: ${ship?.courier || "—"}`,
          `Provider status: ${ship?.providerStatus || ops?.providerStatusRaw || "—"}`,
          `Ops state: ${ops?.opsStateLabel || ops?.opsState || "—"}`,
        ].join("\n")
      : buildShiprocketSupportClipboardText({ orderId, ship, ops });
    try {
      await navigator.clipboard.writeText(text);
      setActionMsg({
        type: "ok",
        surface: "ops",
        text: `Order details copied. Paste them in ${providerName} support if needed.`,
      });
    } catch {
      setActionMsg({
        type: "err",
        surface: "ops",
        text: "Could not copy to clipboard. Copy AWB and order ID manually.",
      });
    }
  }, [orderId, ship, ops, isShipmozo, providerName]);

  const runCancelAndPrepareReship = useCallback(async () => {
    if (
      !window.confirm(
        `Cancel this shipment on ${providerName} and clear old AWB data so you can Ship now again?`
      )
    ) {
      return;
    }
    setActionMsg(null);
    try {
      const r = await cancelShipment(orderId).unwrap();
      setActionMsg({
        type: "ok",
        surface: "ops",
        text: r?.message || `Cancelled on ${providerName}. Use Ship now below to book again.`,
      });
      await refreshOrder();
    } catch (e) {
      setActionMsg({
        type: "err",
        surface: "ops",
        text: fulfillmentActionErrorText(e, "Cancel failed."),
      });
    }
  }, [cancelShipment, orderId, refreshOrder, providerName]);

  useEffect(() => {
    if (!orderId || !hasCarrierAwb || !ship.shiprocketOrderId) return;
    const needsSync =
      Boolean(ship.lastPickupError) ||
      (isPickupBookedOnOrder(ship, ops.opsState) && !ship.pickupDate && !ship.pickupScheduledAt);
    if (!needsSync) return;
    let cancelled = false;
    (async () => {
      try {
        await syncShiprocket(orderId).unwrap();
        if (!cancelled) await refreshOrder();
      } catch {
        /* ignore background sync errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orderId,
    hasCarrierAwb,
    ship.shiprocketOrderId,
    ship.pickupDate,
    ship.lastPickupError,
    ship.manifestUrl,
    ship.pickupScheduledAt,
    syncShiprocket,
    refreshOrder,
  ]);
  const quoteShip = order?.shippingSnapshot || {};
  const coupon = order?.appliedCoupon;

  if (loading && !order) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-screen">
        <div className="max-w-6xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-40 bg-slate-200 rounded-md" />
          <div className="h-64 bg-slate-200 rounded-md" />
        </div>
      </div>
    );
  }

  if (error) {
    const msg =
      error?.data?.message ||
      error?.message ||
      (typeof error?.data === "string" ? error.data : null) ||
      "Could not load order.";
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-screen">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 mb-6 font-medium hover:text-slate-900"
          >
            ← Back to orders
          </button>
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{msg}</div>
        </div>
      </div>
    );
  }

  if (!loading && !error && !order) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-screen">
        <div className="max-w-6xl mx-auto">
          <button type="button" onClick={onBack} className="text-slate-600 mb-4 hover:text-slate-900">
            ← Back to orders
          </button>
          <p className="text-slate-600">Order could not be loaded.</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const removedArchive = Array.isArray(order.removedItemsArchive) ? order.removedItemsArchive : [];
  const weightSnap = order.shippingWeightSnapshot;
  const weightByVariantId = new Map();
  for (const row of weightSnap?.lines || []) {
    if (row?.variantId != null) weightByVariantId.set(String(row.variantId), row);
  }
  const packageDimsLabel = formatPackageDims(weightSnap?.dims);
  const packageDimWeightKg =
    weightSnap?.totalDimWeightKg != null
      ? Number(weightSnap.totalDimWeightKg)
      : dimWeightKgFromDims(weightSnap?.dims);
  const weightSourceCatalogFallback = String(weightSnap?.source || "") === "catalog_fallback";
  const pi = order.paymentInfo && typeof order.paymentInfo === "object" ? order.paymentInfo : {};
  const refundHistory = Array.isArray(order.refundHistory) ? order.refundHistory : [];
  const showRazorpayIds =
    String(pi.method || "").toLowerCase() === "online" ||
    (String(order.paymentStatus || "") === "paid" && (pi.razorpayOrderId || pi.razorpayPaymentId));
  const providerStatusRaw = tracking?.providerStatus || ship?.providerStatus || null;
  const opsExceptionStates = new Set(["PICKUP_EXCEPTION", "PROVIDER_RESET", "NEEDS_MANUAL_REVIEW"]);
  const shiprocketMirrorOps = new Set(["AWB_ASSIGNED", "PICKUP_SCHEDULED", "MANIFEST_READY"]);
  const useOpsPrimaryStatus = ops?.opsState && opsExceptionStates.has(ops.opsState);
  const opsMirrorLine = [ops?.courierOpsLine1, ops?.courierOpsLine2].filter(Boolean).join(" · ");
  const carrierStatusDisplay = shiprocketMirrorOps.has(ops?.opsState)
    ? opsMirrorLine || providerStatusRaw || ops?.opsStateLabel
    : useOpsPrimaryStatus
      ? ops.courierOpsLine1 || ops.opsStateLabel || providerStatusRaw
      : providerStatusRaw || ops.courierOpsLine1 || ops.opsStateLabel || null;
  const carrierStatusSecondary =
    useOpsPrimaryStatus && providerStatusRaw && providerStatusRaw !== carrierStatusDisplay
      ? providerStatusRaw
      : ops.courierOpsLine2 || null;
  const hideStaleTracking = ops?.opsState === "PROVIDER_RESET";
  const lastSyncedAt = tracking?.lastSyncedAt || ship?.lastSyncAt || null;
  const lastSyncError = ship?.lastError || null;
  const trackingTimeline = timelineRowsFromTracking(tracking);
  const carrierTimeline = (() => {
    let rows =
      trackingTimeline.length > 0
        ? trackingTimeline
        : normalizeTrackingEvents(ship?.rawEvents);
    const providerNow = providerStatusRaw;
    const preInTransit = ![
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
      "PROVIDER_RESET",
      "PAYMENT_FAILED",
    ].includes(ops?.opsState);
    const norm = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
    const isStaleCancel = (value) =>
      /pickupcancelled|pickup cancelled|auto cancel|shipment reset on shiprocket/.test(norm(value));
    const onlyStaleCancel =
      rows.length > 0 && rows.every((row) => isStaleCancel(row.status || row.description));
    const hasCurrent =
      providerNow && rows.some((row) => norm(row.status) === norm(providerNow));
    if (preInTransit && providerNow && (!hasCurrent || onlyStaleCancel)) {
      rows = [
        ...rows.filter((row) => !isStaleCancel(row.status || row.description)),
        {
          id: "provider-current",
          status: providerNow,
          description:
            ops?.opsState === "AWB_ASSIGNED"
              ? isShipmozo
                ? shipmozoNeedsManualPickup
                  ? "Schedule pickup on Shipmozo to continue."
                  : "Download shipping label on Shipmozo."
                : "Schedule pickup on Shiprocket to continue."
              : null,
          location: null,
          timestamp: lastSyncedAt || new Date().toISOString(),
        },
      ];
    } else if (preInTransit && providerNow) {
      rows = rows.filter((row) => !isStaleCancel(row.status || row.description));
    }
    return rows;
  })();

  const primaryActionKey = ops?.primaryAction || "openDetail";
  const primaryActionLabel =
    ops?.primaryActionLabel || FULFILLMENT_PRIMARY_ACTION_LABELS[primaryActionKey] || "Open";
  const currentAwb = String(ship.awbCode || ship.trackingNumber || '').trim();
  const manifestAwb = String(ship.fulfillmentManifestAwb || '').trim();
  const labelAwb = String(ship.fulfillmentLabelAwb || '').trim();
  const manifestIsStale = Boolean(currentAwb && ship.manifestUrl && manifestAwb !== currentAwb);
  const labelIsStale = Boolean(currentAwb && ship.labelUrl && labelAwb !== currentAwb);
  const hasManifest = Boolean(ship.manifestUrl) && !manifestIsStale;
  const hasLabel =
    (Boolean(ship.labelUrl) && !labelIsStale) ||
    (isShipmozo && Boolean(ship.labelDownloaded));
  const step1Done = hasCarrierAwb;
  const step2Done = pickupAlreadyScheduled;
  const step3Done = isShipmozo ? true : hasManifest;
  const labelStepNumber = isShipmozo && !showPickupStep ? 2 : showManifestStep ? 4 : 3;
  const fulfillmentFocusStep =
    primaryActionKey === "shipNow"
      ? 1
      : primaryActionKey === "schedulePickup"
        ? 2
        : primaryActionKey === "generateManifest" || primaryActionKey === "downloadManifest"
          ? 3
          : primaryActionKey === "downloadLabel"
            ? labelStepNumber
            : !step1Done
              ? 1
              : isShipmozo && !showPickupStep
                ? labelStepNumber
                : !step2Done
                  ? 2
                  : !step3Done
                    ? 3
                    : labelStepNumber;
  const shiprocketMirrorStatus = opsMirrorLine || ops?.courierOpsLine1 || ship.providerStatus || null;
  const showNextActionBanner =
    showInvoiceAndLogistics &&
    canRunFulfillmentActions &&
    primaryActionKey !== "openDetail" &&
    !isExceptionOpsState;

  return (
    <div className="p-3 md:p-5 bg-[#F8FAFC] min-h-screen pb-10">
      <div className="max-w-7xl mx-auto space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 text-sm font-medium hover:text-slate-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to orders
        </button>

        {/* Title row — order id, status, and pending confirm/cancel in one glance */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 bg-white rounded-md border border-slate-200 shadow-sm px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order</p>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              #{String(order.orderId || "").replace(/^#/, "")}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
                  shippingProviderKey === "shipmozo"
                    ? "bg-teal-50 text-teal-800 border-teal-200"
                    : "bg-indigo-50 text-indigo-800 border-indigo-200"
                }`}
              >
                {shippingProviderKey === "shipmozo" ? "Shipmozo" : "Shiprocket"}
              </span>
              <span className="text-xs text-slate-500">{formatDateHeader(order.createdAt)}</span>
              {shippingProviderKey === "shipmozo" &&
              (ship?.shipmozoOrderId || ship?.shipmentId) ? (
                <span className="text-xs font-semibold text-teal-800 tracking-wide font-mono">
                  Shipmozo ID: {String(ship.shipmozoOrderId || ship.shipmentId).trim()}
                </span>
              ) : null}
              {shippingProviderKey !== "shipmozo" &&
              formatSrpidDisplay(ship?.shiprocketPickupId) ? (
                <span className="text-xs font-semibold text-indigo-700 tracking-wide">
                  SRPID: {formatSrpidDisplay(ship.shiprocketPickupId)}
                </span>
              ) : null}
            </div>
            {showNextActionBanner ? (
              <p className="text-xs text-blue-700 mt-1.5">
                Next: <span className="font-semibold">{primaryActionLabel}</span>
                {ops.nextStepMessage ? (
                  <span className="text-slate-600"> — {ops.nextStepMessage}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 items-center lg:justify-end">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${statusBadgeClass(order.orderStatus, order.shipmentInfo?.providerStatus)}`}
              title="Order status"
            >
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Status</span>
              {labelOrderStatus(order.orderStatus, order.shipmentInfo?.providerStatus)}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border ${paymentBadgeClass(order.paymentStatus)}`}
              title="Payment status"
            >
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Pay</span>
              {labelPaymentStatus(order.paymentStatus)}
            </span>
            {isPendingOrder ? (
              <>
                <button
                  type="button"
                  disabled={fulfillmentBusy || !carrierPaymentReady}
                  onClick={async () => {
                    setActionMsg(null);
                    try {
                      const data = await bulkConfirm({ orderIds: [orderId] }).unwrap();
                      const row = (data.results || []).find((r) => r.orderId === orderId);
                      if (row && !row.success) {
                        throw new Error(row.message || row.code || "Confirm failed.");
                      }
                      const deferred = row?.code === "CONFIRMED_SHIPMENT_DEFERRED";
                      setActionMsg({
                        type: deferred ? "warn" : "ok",
                        text:
                          row?.message ||
                          (deferred
                            ? "Order confirmed. Shiprocket create failed — retry Ship now below."
                            : "Order confirmed."),
                      });
                    } catch (e) {
                      setActionMsg({
                        type: "err",
                        text: fulfillmentActionErrorText(e, "Confirm failed."),
                      });
                    }
                  }}
                  className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkConfirmState.isLoading ? "Confirming…" : "Confirm order"}
                </button>
                <button
                  type="button"
                  disabled={fulfillmentBusy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Cancel this pending order? Stock will be restored and the customer will not be shipped."
                      )
                    ) {
                      return;
                    }
                    setActionMsg(null);
                    try {
                      const data = await bulkCancel({ orderIds: [orderId] }).unwrap();
                      const row = (data.results || []).find((r) => r.orderId === orderId);
                      if (row && !row.success) {
                        throw new Error(row.message || row.code || "Cancel failed.");
                      }
                      setActionMsg({
                        type: "ok",
                        text: row?.message || "Order cancelled.",
                      });
                    } catch (e) {
                      setActionMsg({
                        type: "err",
                        text: fulfillmentActionErrorText(e, "Cancel failed."),
                      });
                    }
                  }}
                  className="px-4 py-2 text-sm font-bold border border-red-300 text-red-800 rounded-md bg-white hover:bg-red-50 disabled:opacity-50"
                >
                  {bulkCancelState.isLoading ? "Cancelling…" : "Cancel"}
                </button>
              </>
            ) : null}
            {showInvoiceAndLogistics ? (
              <button
                type="button"
                onClick={printTaxInvoice}
                disabled={invoiceBusy || !orderId}
                className="px-3 py-1.5 text-xs font-bold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {invoiceBusy ? "…" : "Print invoice"}
              </button>
            ) : null}
          </div>
        </div>

        {actionMsg?.text && !actionMsg?.surface ? (
          <div
            className={`rounded-md border px-4 py-2.5 text-sm shadow-sm ${
              actionMsg.type === "err"
                ? "bg-red-50 border-red-200 text-red-900"
                : actionMsg.type === "warn"
                  ? "bg-amber-50 border-amber-200 text-amber-950"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
            role="status"
            aria-live="polite"
          >
            {actionMsg.text}
          </div>
        ) : null}

        {order?.paymentInfo?.oosShippingSettlement?.pending === true ? (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold">Settlement pending (after Ship Now)</p>
            <p className="mt-0.5 leading-relaxed text-amber-900/90">
              OOS edit saved without refund. After Ship Now / Refresh {providerName}, bill uses actual courier shipping
              (held checkout ship was{" "}
              {formatInr(order.paymentInfo.oosShippingSettlement.heldDeliveryCharges)}; never zero). Excess prepaid is
              refunded; balance due / COD will not increase.
            </p>
          </div>
        ) : null}

        {(carrierPaymentHint || fulfillmentBlockMessage) && (
          <div
            className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div
              className={`rounded-md px-3 py-2 text-xs border ${
                fulfillmentBlockMessage
                  ? "text-slate-700 bg-slate-100 border-slate-200"
                  : "text-amber-900 bg-amber-50 border-amber-100"
              }`}
            >
              {fulfillmentBlockMessage || carrierPaymentHint}
            </div>
          </div>
        )}


        {orderId && !showInvoiceAndLogistics && !isPendingOrder && fulfillmentActionsBlocked && (
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800">Invoice & logistics not available</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Cancelled and unpaid orders do not need a tax invoice or shipment booking.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left — items, logistics (not full page), tracking */}
          <div className="lg:col-span-2 space-y-4">
            {isPendingOrder ? (
              <AdminPendingOrderEditPanel
                order={order}
                orderId={orderId}
                disabled={fulfillmentBusy}
                onApplied={async () => {
                  setActionMsg({ type: "ok", text: "Pending order items updated." });
                  await refreshOrder();
                }}
              />
            ) : (
                <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Items in this order
                      {removedArchive.length > 0 ? (
                        <span className="text-xs font-normal text-slate-500 ml-1.5">
                          ({items.length} active · {removedArchive.length} removed)
                        </span>
                      ) : null}
                    </h3>
                    {weightSnap?.totalWeightKg != null && (
                      <div className="text-right text-[11px] space-y-0.5 text-slate-600">
                        <p>
                          Weight{" "}
                          <span className="font-semibold text-slate-900">{formatKg(weightSnap.totalWeightKg)}</span>
                          {packageDimsLabel ? (
                            <>
                              {" · "}
                              <span className="font-semibold text-slate-900">{packageDimsLabel}</span>
                            </>
                          ) : null}
                        </p>
                        {weightSourceCatalogFallback && (
                          <p className="text-amber-700">Estimated from catalog (legacy order)</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((line, idx) => {
                      const name = line?.productId?.name || "Product";
                      const img =
                        line?.thumbnailUrl || line?.productId?.images?.[0]?.url || line?.productId?.images?.[0];
                      const sku = line?.sku || "—";
                      const qty = line?.quantity ?? 0;
                      const lineTotal = Number(line?.lineTotal ?? line?.priceSnapshot?.total) || 0;
                      const weightRow = weightByVariantId.get(String(line?.variantId ?? ""));
                      const lineDimsLabel = weightRow ? formatPackageDims(weightRow) : null;
                      const unitDimWeightKg =
                        weightRow?.unitDimWeightKg != null
                          ? Number(weightRow.unitDimWeightKg)
                          : weightRow
                            ? dimWeightKgFromDims(weightRow)
                            : null;
                      const lineDimWeightKg =
                        weightRow?.lineDimWeightKg != null
                          ? Number(weightRow.lineDimWeightKg)
                          : unitDimWeightKg != null
                            ? Math.round(unitDimWeightKg * qty * 100) / 100
                            : null;
                      return (
                        <div key={idx} className="px-4 py-3.5 flex gap-4">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-md border border-slate-100 bg-slate-50 overflow-hidden">
                            {img ? (
                              <img src={img} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">
                                📦
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-snug">{name}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Qty {qty} · SKU <span className="font-mono">{sku}</span>
                                {weightRow ? (
                                  <>
                                    {" · "}
                                    {formatKg(weightRow.lineWeightKg)}
                                  </>
                                ) : null}
                                {lineDimsLabel ? ` · ${lineDimsLabel}` : null}
                                {lineDimWeightKg != null ? ` · dim ${formatKg(lineDimWeightKg)}` : null}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-slate-900 shrink-0">{formatInr(lineTotal)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {removedArchive.length > 0 ? (
                      <>
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Removed (out of stock)
                          </p>
                        </div>
                        {removedArchive.map((line, idx) => {
                          const name = line?.productName || line?.productId?.name || "Product";
                          const sku = line?.sku || "—";
                          const qty = line?.quantity ?? 0;
                          const lineTotal =
                            Number(line?.lineTotal ?? line?.priceSnapshot?.total) ||
                            Number(line?.priceSnapshot?.sale ?? line?.priceSnapshot?.base ?? 0) * qty;
                          const unitPrice =
                            line?.priceSnapshot?.sale ?? line?.priceSnapshot?.base ?? null;
                          return (
                            <div
                              key={`removed-${idx}`}
                              className="px-4 py-3.5 flex gap-4 opacity-75 bg-slate-50/60"
                            >
                              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-md border border-slate-100 bg-slate-100 overflow-hidden flex items-center justify-center text-2xl text-slate-300">
                                📦
                              </div>
                              <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-slate-400 line-through leading-snug">
                                      {name}
                                    </p>
                                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                                      {removedArchiveBadge(line?.reason)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5 line-through">
                                    Qty {qty} · SKU <span className="font-mono">{sku}</span>
                                    {unitPrice != null ? ` · ${formatInr(unitPrice)} each` : ""}
                                  </p>
                                </div>
                                <p className="text-sm font-bold text-slate-400 line-through shrink-0">
                                  {formatInr(lineTotal)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : null}
                  </div>

                  <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>{formatInr(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Taxes & Others</span>
                      <span>{formatInr(order.tax)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Delivery</span>
                      <span>
                        {Number(order.deliveryCharges) === 0 ? (
                          <span className="text-blue-600 font-semibold">FREE</span>
                        ) : (
                          formatInr(order.deliveryCharges)
                        )}
                      </span>
                    </div>
                    {Number(order.discount) > 0 && (
                      <div className="flex justify-between text-blue-700">
                        <span>Discount{coupon?.code ? ` (${coupon.code})` : ""}</span>
                        <span>−{formatInr(order.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                      <span>Grand total</span>
                      <span>{formatInr(order.totalAmount)}</span>
                    </div>
                  </div>
                </div>
            )}

        {orderId && showInvoiceAndLogistics && (
          <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Logistics</h3>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      shippingProviderKey === "shipmozo"
                        ? "bg-teal-50 text-teal-800 border-teal-200"
                        : "bg-indigo-50 text-indigo-800 border-indigo-200"
                    }`}
                  >
                    {shippingProviderKey === "shipmozo" ? "Shipmozo" : "Shiprocket"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Manage courier assignment and tracking</p>
              </div>
              {caps.syncShiprocket ? (
                <button
                  type="button"
                  disabled={fulfillmentBusy}
                  onClick={async () => {
                    setActionMsg(null);
                    try {
                      const r = await syncShiprocket(orderId).unwrap();
                      setActionMsg({
                        type: "ok",
                        surface: "ops",
                        text: r?.message || "Updated from Shiprocket.",
                      });
                      await refreshOrder();
                      if (typeof onRefreshTracking === "function") await onRefreshTracking();
                    } catch (e) {
                      setActionMsg({
                        type: "err",
                        surface: "ops",
                        text: fulfillmentActionErrorText(e, "Sync failed."),
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {syncShiprocketState.isLoading ? "Refreshing…" : "Refresh"}
                </button>
              ) : null}
            </div>

            {actionMsg?.surface === "invoice" && actionMsg?.text ? (
              <div
                className={`mx-4 mt-3 rounded-lg px-3 py-2 text-xs border ${
                  actionMsg.type === "err"
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-blue-50 border-blue-200 text-blue-900"
                }`}
                role="status"
              >
                {actionMsg.text}
              </div>
            ) : null}

            <div className="p-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-500 font-semibold">Quoted courier (checkout)</p>
                <p className="font-semibold text-slate-900 mt-0.5 truncate">{quoteShip.courierName || "—"}</p>
                <p className="text-slate-500 mt-0.5">
                  Est. delivery: {quoteShip.estimatedDays != null ? `${quoteShip.estimatedDays} days` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-500 font-semibold">Assigned courier</p>
                <p className={`font-semibold mt-0.5 truncate ${ship.courier ? "text-slate-900" : "text-slate-400 italic"}`}>
                  {ship.courier || "Pending assignment"}
                </p>
                {isShipmozo && (ship.shipmozoOrderId || ship.shipmentId) ? (
                  <p className="text-slate-500 mt-0.5 font-mono truncate">
                    Shipmozo ID {String(ship.shipmozoOrderId || ship.shipmentId).trim()}
                  </p>
                ) : null}
                {!isShipmozo && ship.shiprocketOrderId ? (
                  <p className="text-slate-500 mt-0.5 font-mono truncate">ID {ship.shiprocketOrderId}</p>
                ) : null}
              </div>
            </div>

            {ship.lastError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                <p className="font-semibold">Last shipment sync error</p>
                <p className="mt-0.5">{ship.lastError}</p>
                {String(ship.lastError).includes("pickup location") && (
                  <p className="mt-2 text-red-800">
                    Fix: in <code className="text-[11px] bg-red-100 px-1 rounded">backend/offerWaleBaba/.env</code> set{" "}
                    <code className="text-[11px] bg-red-100 px-1 rounded">SHIPROCKET_PICKUP_LOCATION</code> to your
                    Shiprocket pickup nickname (e.g. <code className="text-[11px] bg-red-100 px-1 rounded">work</code>),
                    save, restart the API, then use Ship again.
                  </p>
                )}
              </div>
            )}

            {showOpsAlert ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold">{ops.opsStateLabel || "Shipment attention required"}</p>
                <p className="mt-1 text-xs leading-relaxed">{ops.nextStepMessage}</p>
                {ship.providerStatus ? (
                  <p className="mt-2 text-[11px] text-amber-800">Shiprocket status: {ship.providerStatus}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 mt-3">
                  {caps.retryPickup ? (
                    <button
                      type="button"
                      disabled={fulfillmentBusy}
                      title={blockReasons.retryPickup}
                      onClick={async () => {
                        setActionMsg(null);
                        try {
                          const r = await retryPickup(orderId).unwrap();
                          setActionMsg({
                            type: "ok",
                            surface: "ops",
                            text: r?.message || "Pickup retry submitted on Shiprocket.",
                          });
                          await refreshOrder();
                        } catch (e) {
                          setActionMsg({
                            type: "err",
                            surface: "ops",
                            text: fulfillmentActionErrorText(e, "Pickup retry failed."),
                          });
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-900 text-white hover:bg-amber-950 disabled:opacity-50"
                    >
                      {retryPickupState.isLoading ? "Working…" : "Retry pickup"}
                    </button>
                  ) : null}
                  {caps.openShiprocketSupport ? (
                    <button
                      type="button"
                      disabled={fulfillmentBusy}
                      onClick={() => {
                        void copySupportContext();
                        window.open(
                          resolveShiprocketSupportUrl(externalLinks),
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 bg-white hover:bg-amber-100/60"
                    >
                      Open Shiprocket support
                    </button>
                  ) : null}
                  {caps.syncShiprocket ? (
                    <button
                      type="button"
                      disabled={fulfillmentBusy}
                      onClick={async () => {
                        setActionMsg(null);
                        try {
                          const r = await syncShiprocket(orderId).unwrap();
                          setActionMsg({
                            type: "ok",
                            surface: "ops",
                            text: r?.message || "Updated from Shiprocket.",
                          });
                          await refreshOrder();
                        } catch (e) {
                          setActionMsg({
                            type: "err",
                            surface: "ops",
                            text: fulfillmentActionErrorText(e, "Sync failed."),
                          });
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 bg-white hover:bg-amber-100/60 disabled:opacity-50"
                    >
                      {syncShiprocketState.isLoading ? "Syncing…" : "Refresh Shiprocket"}
                    </button>
                  ) : null}
                  {caps.cancelShipment ? (
                    <button
                      type="button"
                      disabled={fulfillmentBusy}
                      title={blockReasons.cancelShipment}
                      onClick={() => {
                        void runCancelAndPrepareReship();
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 text-red-800 bg-white hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel and ship again
                    </button>
                  ) : null}
                </div>
                <FulfillmentStatusBanner
                  msg={actionMsg?.surface === "ops" ? actionMsg : null}
                  providerLabel={shippingProviderKey === "shipmozo" ? "Shipmozo" : "Shiprocket"}
                />
              </div>
            ) : null}

            {fulfillmentActionsBlocked ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-800">Fulfilment actions unavailable</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Courier details above are read-only. Ship now, pickup, labels, and Shiprocket cancellation cannot be
                  used on a {labelOrderStatus(order.orderStatus).toLowerCase()} order.
                </p>
              </div>
            ) : (
              <>
              {(showStandardFulfillmentSteps || showReshipStepOnly) ? (
              <>
              <FulfillmentStepCard
                step={1}
                focusStep={fulfillmentFocusStep}
                done={step1Done}
                title="Step 1 · Create & assign"
                heading="Assign courier"
              >
                {step1Done ? (
                  <p className="text-sm text-blue-900">
                    <span className="font-semibold">{ship.courier || "Courier"}</span>
                    {hasCarrierAwb ? (
                      <>
                        {" "}
                        · AWB <span className="font-mono">{ship.awbCode || ship.trackingNumber}</span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          fulfillmentBusy ||
                          Boolean(ship.awbCode || ship.trackingNumber) ||
                          !carrierPaymentReady ||
                          !caps.shipNow
                        }
                        title={blockReasons.shipNow || "Create on Shiprocket (if needed) and assign courier + AWB"}
                        onClick={async () => {
                          setActionMsg(null);
                          try {
                            const r = await ensureShipment(orderId).unwrap();
                            if (!r?.success) {
                              throw new Error(r?.message || "Shipment step failed.");
                            }
                            const si = r?.order?.shipmentInfo || {};
                            const sr = r?.shipment || {};
                            const awbFromResp = Boolean(
                              si.awbCode ||
                                si.trackingNumber ||
                                sr.awb_code ||
                                sr.awbCode ||
                                sr.tracking_number
                            );
                            let assignResult = null;
                            if (!awbFromResp) {
                              try {
                                assignResult = await assignShip({ orderId }).unwrap();
                              } catch (ae) {
                                if (ae?.data?.code === "AWB_ALREADY_ASSIGNED") {
                                  setActionMsg({
                                    type: "ok",
                                    text: "Shipment already has an AWB. Details will refresh shortly.",
                                  });
                                  return;
                                }
                                if (
                                  ae?.data?.code === "QUOTED_COURIER_UNAVAILABLE" ||
                                  ae?.data?.code === "NO_ALTERNATE_COURIER"
                                ) {
                                  const quoted = ae?.data?.quotedCourier;
                                  let suggested = ae?.data?.suggestedCourier;
                                  if (
                                    suggested?.courierId != null &&
                                    quoted?.courierId != null &&
                                    Number(suggested.courierId) === Number(quoted.courierId)
                                  ) {
                                    suggested = null;
                                  }
                                  const providerName =
                                    shippingProviderKey === "shipmozo" ? "Shipmozo" : "Shiprocket";
                                  const quotedFreight = ae?.data?.quotedFreightInr;
                                  const gapLine =
                                    suggested?.exceedsQuotedFreight &&
                                    suggested?.freightGapInr != null &&
                                    Number(suggested.freightGapInr) > 0
                                      ? `\nCustomer paid ₹${quotedFreight ?? "—"} shipping; suggested is ₹${suggested.totalCharges ?? "—"} (gap ₹${suggested.freightGapInr} is merchant-side only).`
                                      : suggested && quotedFreight != null
                                        ? `\nCustomer paid ₹${quotedFreight} shipping; suggested ₹${suggested.totalCharges ?? "—"}.`
                                        : "";
                                  const confirmMsg = suggested
                                    ? `Checkout courier "${quoted?.courierName || quoted?.courierId || "quoted"}" could not be assigned on ${providerName}.${gapLine}\n\nAssign suggested "${suggested.courierName || suggested.courierId}" (₹${suggested.totalCharges ?? "—"})?\n\nCustomer order total will NOT change.\nCancel to assign from ${providerName} panel instead.`
                                    : `${ae?.data?.message || "Checkout courier could not be assigned."}\n\nRetry assigning the checkout courier, or cancel and assign from the ${providerName} panel.\nCustomer order total will NOT change.`;
                                  const ok = window.confirm(confirmMsg);
                                  if (!ok) {
                                    setActionMsg({
                                      type: "err",
                                      surface: "ship",
                                      text: `Ship now cancelled. Assign courier from ${providerName} panel or pick another courier.`,
                                    });
                                    return;
                                  }
                                  assignResult = await assignShip({
                                    orderId,
                                    confirmSubstitute: true,
                                    ...(suggested?.courierId != null
                                      ? { courierId: suggested.courierId }
                                      : {}),
                                  }).unwrap();
                                } else {
                                  throw ae;
                                }
                              }
                            }
                            const siFinal = assignResult?.order?.shipmentInfo || si;
                            const srFinal = assignResult?.shipment || sr;
                            const awbDisp =
                              siFinal.awbCode ||
                              siFinal.trackingNumber ||
                              srFinal.awb_code ||
                              srFinal.awbCode ||
                              srFinal.tracking_number;
                            setActionMsg({
                              type: "ok",
                              surface: "ship",
                              text: awbDisp
                                ? `Courier booked. AWB / tracking: ${awbDisp}. Details refresh in a moment.`
                                : "Shipment updated. Details will refresh shortly.",
                            });
                            await refreshOrder();
                          } catch (e) {
                            setActionMsg({
                              type: "err",
                              surface: "ship",
                              text: fulfillmentActionErrorText(e, "Ship now failed."),
                            });
                          }
                        }}
                        className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {ensureState.isLoading || assignState.isLoading ? "Working…" : "Ship now"}
                      </button>
                    </div>
                    <FulfillmentStatusBanner
                      msg={actionMsg?.surface === "ship" ? actionMsg : null}
                      providerLabel={shippingProviderKey === "shipmozo" ? "Shipmozo" : "Shiprocket"}
                    />
                  </>
                )}
              </FulfillmentStepCard>
              </>
              ) : null}

              {showStandardFulfillmentSteps ? (
              <>
              {showPickupStep ? (
              <FulfillmentStepCard
                step={2}
                focusStep={fulfillmentFocusStep}
                done={step2Done}
                title="Step 2 · Pickup"
                heading="Schedule pickup"
              >
                <p className="text-[11px] text-slate-500 mb-3 max-w-2xl leading-relaxed sr-only">
                  After AWB is assigned, schedule when the courier should collect the parcel.
                </p>
                {!pickupAlreadyScheduled && pickupUsesShiprocketRules ? (
                  <p className="text-[11px] text-slate-500 mb-2 max-w-xl">
                    Available dates follow your Shiprocket pickup schedule.
                  </p>
                ) : null}
                {!pickupAlreadyScheduled && caps.schedulePickup && pickupCalendarRes?.scheduleRulesMessage ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2 max-w-xl leading-relaxed">
                    {pickupCalendarRes.scheduleRulesMessage}
                  </p>
                ) : null}
                {pickupAlreadyScheduled ? (
                  <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 mb-2 max-w-xl">
                    Pickup booked on Shiprocket
                    {ship.pickupDate ? ` for ${ship.pickupDate}` : ""}. Continue with Step 3 below.
                  </p>
                ) : null}
                {!pickupAlreadyScheduled ? (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Pickup date</span>
                    {pickupUsesShiprocketRules && pickupAllowedDates.length > 0 ? (
                      <select
                        value={pickupAllowedDates.includes(pickupDate) ? pickupDate : pickupAllowedDates[0]}
                        onChange={(e) => setPickupDate(e.target.value)}
                        disabled={pickupAlreadyScheduled}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white min-w-[11rem]"
                      >
                        {pickupAllowedDates.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        disabled={pickupAlreadyScheduled}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white min-w-[9.5rem]"
                      />
                    )}
                  </label>
                  <button
                    type="button"
                    disabled={
                      fulfillmentBusy ||
                      !carrierPaymentReady ||
                      !(ship.awbCode || ship.trackingNumber) ||
                      !pickupDate ||
                      !caps.schedulePickup
                    }
                    title={blockReasons.schedulePickup}
                    onClick={async () => {
                      setActionMsg(null);
                      try {
                        const r = await schedulePickup({ orderId, pickupDate }).unwrap();
                        const fb = pickupScheduleFeedback({ response: r, selectedDate: pickupDate });
                        setActionMsg({
                          type: fb.type,
                          surface: "pickup",
                          text: fb.text,
                        });
                        await refreshOrder();
                        if (typeof onRefreshTracking === "function") await onRefreshTracking();
                      } catch (e) {
                        setActionMsg({
                          type: "err",
                          surface: "pickup",
                          text: fulfillmentActionErrorText(e, "Pickup schedule failed."),
                        });
                      }
                    }}
                    className="px-3 py-2 text-xs font-semibold border border-indigo-300 text-indigo-800 rounded-lg bg-white hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {pickupState.isLoading ? "Working…" : "Schedule pickup"}
                  </button>
                </div>
                ) : null}
                {pickupAlreadyScheduled ? (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Courier pickup day
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      When the courier collects parcels (Shiprocket → Pickups → &quot;For …&quot; date).
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {ship.pickupDate || "—"}
                    </p>
                    {!ship.pickupDate && pickupAlreadyScheduled ? (
                      <p className="text-[10px] text-amber-700 mt-1">
                        Not in our DB yet — confirm on Shiprocket panel, then click Refresh from Shiprocket.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Saved in our system</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      When we saved pickup on this order (timestamp — not the courier day).
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {formatDateHeader(ship.pickupScheduledAt) ||
                        (ship.manifestUrl ? "Yes (manifest on file)" : "—")}
                    </p>
                    {shiprocketMirrorStatus ? (
                      <p className="text-[10px] text-slate-500 mt-1">Shiprocket status: {shiprocketMirrorStatus}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={fulfillmentBusy || !carrierPaymentReady || !ship.shiprocketOrderId || !caps.syncShiprocket}
                  title={blockReasons.syncShiprocket}
                  onClick={async () => {
                    setActionMsg(null);
                    try {
                      const r = await syncShiprocket(orderId).unwrap();
                      setActionMsg({
                        type: "ok",
                        surface: "pickup",
                        text: r?.message || "Updated from Shiprocket.",
                      });
                      await refreshOrder();
                    } catch (e) {
                      setActionMsg({
                        type: "err",
                        surface: "pickup",
                        text: fulfillmentActionErrorText(e, "Sync failed."),
                      });
                    }
                  }}
                  className="mt-2 px-2.5 py-1 text-[11px] font-semibold border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
                >
                  {syncShiprocketState.isLoading ? "Syncing…" : "Refresh from Shiprocket"}
                </button>
                </>
                ) : null}
                {ship.lastPickupError && !pickupAlreadyScheduled ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">Last pickup error</p>
                    <p className="mt-0.5">{ship.lastPickupError}</p>
                  </div>
                ) : null}
                <FulfillmentStatusBanner
                  msg={actionMsg?.surface === "pickup" ? actionMsg : null}
                  providerLabel={providerName}
                />
              </FulfillmentStepCard>
              ) : isShipmozo && shipmozoAutoPickup ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[11px] text-blue-900">
                  Pickup auto-scheduled on Shipmozo after courier assign. No separate schedule or manifest step —
                  download the shipping label next.
                </div>
              ) : null}

              {showManifestStep ? (
              <FulfillmentStepCard
                step={3}
                focusStep={fulfillmentFocusStep}
                done={step3Done}
                title="Step 3 · Manifest"
                heading="Manifest"
                id="admin-manifest-step"
              >
                <p className="text-[11px] text-slate-500 mb-2 max-w-xl leading-relaxed sr-only">
                  Same as Shiprocket panel — download manifest after pickup is scheduled.
                </p>
                {fulfillmentFocusStep === 3 && !step3Done ? (
                  <p className="text-xs font-semibold text-indigo-900 mb-2">{ops.nextStepMessage || primaryActionLabel}</p>
                ) : null}
                {hasLabel && !hasManifest ? (
                  <p className="text-[10px] font-semibold text-blue-700 mb-2">
                    Label already downloaded on Shiprocket — manifest is still required next.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {(caps.generateManifest || caps.downloadManifest) && fulfillmentFocusStep === 3 ? (
                    <button
                      type="button"
                      disabled={
                        fulfillmentBusy ||
                        !carrierPaymentReady ||
                        !hasCarrierAwb ||
                        !(caps.generateManifest || caps.downloadManifest)
                      }
                      title={blockReasons.generateManifest || blockReasons.downloadManifest}
                      onClick={async () => {
                        setActionMsg(null);
                        if (caps.downloadManifest) {
                          void downloadManifestFile();
                          return;
                        }
                        try {
                          const r = await fulfillmentManifest(orderId).unwrap();
                          const u = r?.manifestUrl;
                          setActionMsg({
                            type: "ok",
                            surface: "manifest",
                            text: u ? "Manifest ready on Shiprocket." : "Manifest generated on Shiprocket.",
                          });
                          if (u) window.open(u, "_blank", "noopener,noreferrer");
                          await refreshOrder();
                          if (typeof onRefreshTracking === "function") await onRefreshTracking();
                        } catch (e) {
                          setActionMsg({
                            type: "err",
                            surface: "manifest",
                            text: fulfillmentActionErrorText(e, "Manifest failed."),
                          });
                        }
                      }}
                      className="px-4 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {manifestState.isLoading || manifestDownloadBusy
                        ? "Working…"
                        : caps.downloadManifest
                          ? "Download manifest (PDF)"
                          : "Download manifest"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={fulfillmentBusy || !carrierPaymentReady || !hasCarrierAwb || !caps.generateManifest}
                    title={blockReasons.generateManifest}
                    onClick={async () => {
                      setActionMsg(null);
                      try {
                        const r = await fulfillmentManifest(orderId).unwrap();
                        const u = r?.manifestUrl;
                        setActionMsg({
                          type: "ok",
                          surface: "manifest",
                          text: u ? "Manifest ready. Opening in a new tab." : "Manifest generated.",
                        });
                        if (u) window.open(u, "_blank", "noopener,noreferrer");
                        await refreshOrder();
                      } catch (e) {
                        setActionMsg({
                          type: "err",
                          surface: "manifest",
                          text: fulfillmentActionErrorText(e, "Manifest failed."),
                        });
                      }
                    }}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
                  >
                    {manifestState.isLoading ? "Working…" : "Open manifest"}
                  </button>
                  {!(fulfillmentFocusStep === 3 && caps.generateManifest) ? (
                  <button
                    type="button"
                    disabled={
                      fulfillmentBusy ||
                      manifestDownloadBusy ||
                      !carrierPaymentReady ||
                      !hasCarrierAwb ||
                      !caps.downloadManifest
                    }
                    title={blockReasons.downloadManifest}
                    onClick={downloadManifestFile}
                    className="px-3 py-2 text-xs font-semibold border border-slate-800 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {manifestDownloadBusy ? "Downloading…" : "Download manifest (PDF)"}
                  </button>
                  ) : null}
                </div>
                {hasManifest ? (
                  <p className="text-[11px] text-blue-700 mt-2">Manifest URL saved on this order.</p>
                ) : null}
                <FulfillmentStatusBanner
                  msg={actionMsg?.surface === "manifest" ? actionMsg : null}
                  providerLabel={providerName}
                />
              </FulfillmentStepCard>
              ) : null}

              <FulfillmentStepCard
                step={labelStepNumber}
                focusStep={fulfillmentFocusStep}
                done={hasLabel && (isShipmozo ? step1Done : step3Done)}
                title={`Step ${labelStepNumber} · Shipping label`}
                heading="Shipping label"
                id="admin-shipping-label-step"
                isLast
              >
                <p className="text-[11px] text-slate-500 mb-2 max-w-xl leading-relaxed sr-only">
                  Courier AWB label from {providerName} (parcel sticker). Not your GST tax invoice — use Print invoice
                  in the order header.
                </p>
                {hasLabel && !step3Done && !isShipmozo ? (
                  <p className="text-[10px] font-semibold text-blue-700 mb-2">
                    Label downloaded on Shiprocket — available after manifest step if needed again.
                  </p>
                ) : null}
                {fulfillmentFocusStep === labelStepNumber && caps.downloadLabel ? (
                  <p className="text-xs font-semibold text-indigo-900 mb-2">
                    Next on {providerName}: download shipping label.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      fulfillmentBusy ||
                      labelDownloadBusy ||
                      !carrierPaymentReady ||
                      !hasCarrierAwb ||
                      !caps.downloadLabel
                    }
                    title={blockReasons.downloadLabel}
                    onClick={openShippingLabelInNewTab}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
                  >
                    {labelDownloadBusy ? "Working…" : "Open label"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      fulfillmentBusy ||
                      labelDownloadBusy ||
                      !carrierPaymentReady ||
                      !hasCarrierAwb ||
                      !caps.downloadLabel
                    }
                    title={blockReasons.downloadLabel}
                    onClick={downloadShippingLabelFile}
                    className="px-3 py-2 text-xs font-semibold border border-slate-800 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {labelDownloadBusy
                      ? "Downloading…"
                      : isShipmozo
                        ? "Download label"
                        : "Download label (PDF)"}
                  </button>
                </div>
                <FulfillmentStatusBanner
                  msg={actionMsg?.surface === "label" ? actionMsg : null}
                  providerLabel={providerName}
                />
              </FulfillmentStepCard>

              <div className="pt-1 space-y-2">
                {fulfillmentFocusStep < labelStepNumber ? (
                  <details className="group border border-slate-200 rounded-md bg-slate-50/80 px-3 py-2">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                      <span>
                        Upcoming steps
                        <span className="font-normal text-slate-500">
                          {" "}
                          (after {primaryActionLabel || "current action"})
                        </span>
                      </span>
                      <span className="text-slate-400 group-open:rotate-180 transition-transform" aria-hidden>
                        ▾
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600 border-t border-slate-200 pt-2">
                      {showPickupStep && fulfillmentFocusStep < 2 && !step2Done ? (
                        <li className="flex justify-between gap-2">
                          <span>2 · Schedule pickup</span>
                          <span className="italic text-slate-400">Locked</span>
                        </li>
                      ) : null}
                      {showManifestStep && fulfillmentFocusStep < 3 && !step3Done ? (
                        <li className="flex justify-between gap-2">
                          <span>3 · Manifest</span>
                          <span className="italic text-slate-400">Locked</span>
                        </li>
                      ) : null}
                      {fulfillmentFocusStep < labelStepNumber &&
                      !(hasLabel && (isShipmozo ? step1Done : step3Done)) ? (
                        <li className="flex justify-between gap-2">
                          <span>{labelStepNumber} · Shipping label</span>
                          <span className="italic text-slate-400">Locked</span>
                        </li>
                      ) : null}
                    </ul>
                  </details>
                ) : null}
                <button
                  type="button"
                  disabled={fulfillmentBusy || !canCancelShipment}
                  onClick={() => {
                    void runCancelAndPrepareReship();
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold border border-red-200 text-red-700 rounded-md bg-white hover:bg-red-50 disabled:opacity-50"
                >
                  {cancelState.isLoading ? "Working…" : `Cancel on ${providerName}`}
                </button>
              </div>
              </>
              ) : null}
              </>
            )}
            </div>
          </div>
        )}

            <OrderShipmentTrackingPanel
              ship={ship}
              ops={ops}
              orderStatus={order.orderStatus}
              carrierStatusDisplay={carrierStatusDisplay || (isPendingOrder ? "Awaiting approval" : null)}
              carrierStatusSecondary={carrierStatusSecondary}
              lastSyncedAt={lastSyncedAt}
              lastSyncError={lastSyncError}
              hideStaleTracking={hideStaleTracking}
              carrierTimeline={carrierTimeline}
              trackingLoading={trackingLoading}
              trackingError={trackingError}
              providerKey={shippingProviderKey}
              trackingUrl={tracking?.trackingUrl || ship?.trackingUrl || null}
              formatDateTime={formatDateHeader}
              onRefreshTracking={onRefreshTracking}
            />
          </div>

          {/* Right — customer, payment, quick actions */}
          <div className="space-y-4 lg:sticky lg:top-4">
            <AdminPendingAddressPanel
              order={order}
              orderId={orderId}
              disabled={fulfillmentBusy}
              onApplied={async () => {
                setActionMsg({ type: "ok", text: "Delivery address updated on this order." });
                await refreshOrder();
              }}
            />

            <OrderPaymentSummaryCard
              order={order}
              paymentInfo={pi}
              refundHistory={refundHistory}
              showRazorpayIds={showRazorpayIds}
              formatInr={formatInr}
              formatDateTime={formatDateHeader}
              labelPaymentStatus={labelPaymentStatus}
              paymentMethodLabel={paymentMethodLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
