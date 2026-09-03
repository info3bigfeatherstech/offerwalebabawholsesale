/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  useGetAdminPickupCalendarQuery,
} from "../../ADMIN_REDUX_MANAGEMENT/order_management/adminOrdersApi";
import wholesaleAxios from "../../../../SERVICES/Wholesaleaxios";

const ACTION_LABELS = {
  accept: "Accept",
  reject: "Reject",
  shipNow: "Ship now",
  schedulePickup: "Schedule pickup",
  generateManifest: "Generate manifest",
  downloadManifest: "Download manifest",
  downloadLabel: "Download label",
  downloadTaxInvoice: "Tax invoice",
  syncShiprocket: "Refresh Shiprocket",
  refreshTracking: "Refresh tracking",
  retryPickup: "Retry pickup",
  cancelShipment: "Cancel on Shiprocket",
  openShiprocketSupport: "Open Shiprocket support",
  openShiprocket: "Open on Shiprocket",
  track: "Track",
  openDetail: "Open order",
};

function mutationErrorToString(err) {
  if (!err) return "Request failed.";
  if (String(err?.message || "") === "Cancelled") return null;
  const d = err.data;
  if (typeof d === "object" && d && d.message) return String(d.message);
  if (typeof d === "string") return d;
  return err.message || "Request failed.";
}

function addLocalDaysYmd(days) {
  const t = new Date();
  t.setDate(t.getDate() + days);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveSupportUrl(externalLinks) {
  return (
    externalLinks?.shiprocketSupportUrl ||
    externalLinks?.createTicketUrl ||
    externalLinks?.shiprocketOrderUrl ||
    "https://app.shiprocket.in/seller/support"
  );
}

function useFloatingPanelStyle(anchorRef, open, widthPx = 176) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return undefined;
    }

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const maxLeft = Math.max(8, window.innerWidth - widthPx - 8);
      const left = Math.min(Math.max(8, rect.right - widthPx), maxLeft);

      setStyle({
        position: "fixed",
        left,
        top: rect.bottom + gap,
        zIndex: 9999,
        width: widthPx,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, open, widthPx]);

  return style;
}

async function downloadBlobFromGet(url, defaultFilename) {
  const res = await wholesaleAxios.get(url, { responseType: "blob" });
  const ct = String(res.headers["content-type"] || "").split(";")[0].trim();
  if (ct.includes("application/json")) {
    const text = await res.data.text();
    let msg = "Download failed.";
    try {
      const j = JSON.parse(text);
      if (j?.message) msg = j.message;
    } catch {
      msg = text.slice(0, 300) || msg;
    }
    throw new Error(msg);
  }
  let filename = defaultFilename;
  const dispo = res.headers["content-disposition"];
  if (dispo) {
    const m = /filename\*?=(?:UTF-8''|"?)([^";\n]+)/i.exec(dispo);
    if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, "").trim());
  }
  if (/^image\//i.test(ct) && /\.pdf$/i.test(filename)) {
    const ext = /jpeg|jpg/i.test(ct) ? "jpg" : /webp/i.test(ct) ? "webp" : "png";
    filename = filename.replace(/\.pdf$/i, `.${ext}`);
  } else if ((ct === "application/pdf" || !ct) && !/\.[a-z0-9]+$/i.test(filename)) {
    filename = `${filename}.pdf`;
  }
  const blob = new Blob([res.data], { type: ct || "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
  }
}

async function executeAction(key, ctx) {
  const id = ctx.orderId;
  switch (key) {
    case "accept":
      {
        const data = await ctx.bulkConfirm({ orderIds: [id] }).unwrap();
        const row = Array.isArray(data?.results) ? data.results.find((r) => r.orderId === id) : null;
        if (row && row.success === false) {
          throw new Error(row.message || "Confirm failed.");
        }
      }
      return;
    case "reject":
      if (!window.confirm("Reject this pending order? Stock will be restored.")) {
        throw new Error("Cancelled");
      }
      {
        const data = await ctx.bulkCancel({ orderIds: [id] }).unwrap();
        const row = Array.isArray(data?.results) ? data.results.find((r) => r.orderId === id) : null;
        if (row && row.success === false) {
          throw new Error(row.message || "Cancel failed.");
        }
      }
      return;
    case "shipNow": {
      const ensureResult = await ctx.ensureShipment(id).unwrap();
      if (!ensureResult?.success) {
        throw new Error(ensureResult?.message || "Shipment step failed.");
      }
      const si = ensureResult?.order?.shipmentInfo || {};
      const sr = ensureResult?.shipment || {};
      const awbFromResp = Boolean(
        si.awbCode ||
          si.trackingNumber ||
          sr.awb_code ||
          sr.awbCode ||
          sr.tracking_number
      );
      if (!awbFromResp) {
        try {
          await ctx.assignShip({ orderId: id }).unwrap();
        } catch (assignErr) {
          if (assignErr?.data?.code === "AWB_ALREADY_ASSIGNED") return;
          if (
            assignErr?.data?.code === "QUOTED_COURIER_UNAVAILABLE" ||
            assignErr?.data?.code === "NO_ALTERNATE_COURIER"
          ) {
            const quoted = assignErr?.data?.quotedCourier;
            let suggested = assignErr?.data?.suggestedCourier;
            if (
              suggested?.courierId != null &&
              quoted?.courierId != null &&
              Number(suggested.courierId) === Number(quoted.courierId)
            ) {
              suggested = null;
            }
            const quotedFreight = assignErr?.data?.quotedFreightInr;
            const gapLine =
              suggested?.exceedsQuotedFreight &&
              suggested?.freightGapInr != null &&
              Number(suggested.freightGapInr) > 0
                ? `\nCustomer paid ₹${quotedFreight ?? "—"} shipping; suggested is ₹${suggested.totalCharges ?? "—"} (gap ₹${suggested.freightGapInr} is merchant-side only).`
                : suggested && quotedFreight != null
                  ? `\nCustomer paid ₹${quotedFreight} shipping; suggested ₹${suggested.totalCharges ?? "—"}.`
                  : "";
            const confirmMsg = suggested
              ? `Checkout courier "${quoted?.courierName || quoted?.courierId || "quoted"}" could not be assigned.${gapLine}\n\nAssign suggested "${suggested.courierName || suggested.courierId}" (₹${suggested.totalCharges ?? "—"})?\n\nCustomer order total will NOT change.\nCancel to assign from the shipping panel instead.`
              : `${assignErr?.data?.message || "Checkout courier could not be assigned."}\n\nCustomer order total will NOT change.`;
            if (!window.confirm(confirmMsg)) {
              throw new Error("Ship now cancelled — assign from the shipping panel or pick another courier.");
            }
            await ctx.assignShip({
              orderId: id,
              confirmSubstitute: true,
              ...(suggested?.courierId != null ? { courierId: suggested.courierId } : {}),
            }).unwrap();
            return;
          }
          throw assignErr;
        }
      }
      return;
    }
    case "schedulePickup": {
      const ymd = String(ctx.pickupDate || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        throw new Error("Choose a valid pickup date.");
      }
      await ctx.schedulePickup({ orderId: id, pickupDate: ymd }).unwrap();
      return;
    }
    case "generateManifest":
      await ctx.generateManifest(id).unwrap();
      return;
    case "downloadManifest":
      await downloadBlobFromGet(
        `/orders/admin/items/${encodeURIComponent(String(id))}/fulfillment/manifest-file`,
        `manifest-${id}.pdf`
      );
      return;
    case "downloadLabel":
      await downloadBlobFromGet(
        `/orders/admin/items/${encodeURIComponent(String(id))}/fulfillment/shipping-label-file`,
        ctx.shippingProvider === "shipmozo" ? `Shipmozo-label-${id}.pdf` : `Shiprocket-label-${id}.pdf`
      );
      return;
    case "downloadTaxInvoice": {
      const res = await wholesaleAxios.get(
        `/orders/admin/items/${encodeURIComponent(String(id))}/invoice-html`,
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return;
    }
    case "syncShiprocket":
      await ctx.syncShiprocket(id).unwrap();
      return;
    case "refreshTracking":
      await wholesaleAxios.get(`/orders/items/${encodeURIComponent(String(id))}/track`);
      return;
    case "retryPickup":
      await ctx.retryPickup(id).unwrap();
      return;
    case "cancelShipment":
      if (
        !window.confirm(
          "Cancel this shipment on Shiprocket? You may need to run Ship now again after cancellation."
        )
      ) {
        throw new Error("Cancelled");
      }
      await ctx.cancelShipment(id).unwrap();
      return;
    case "openShiprocketSupport":
    case "openShiprocket": {
      window.open(resolveSupportUrl(ctx.externalLinks), "_blank", "noopener,noreferrer");
      return;
    }
    case "track":
    case "openDetail":
    default:
      ctx.onOpenDetail?.(id);
  }
}

/**
 * Per-row fulfillment actions (list view) — driven by backend shipment ops capabilities.
 */
export default function AdminOrderRowActions({ order, onOpenDetail, onFeedback }) {
  const orderId = order?.orderId;
  const caps = order?.actionCapabilities || {};
  const blockReasons = order?.blockReasons || {};
  const externalLinks = order?.externalLinks || {};
  const primaryKey = order?.primaryAction || "openDetail";
  const primaryLabel = order?.primaryActionLabel || ACTION_LABELS[primaryKey] || "Open";

  const [menuOpen, setMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef(null);

  const menuPanelStyle = useFloatingPanelStyle(anchorRef, menuOpen, 176);
  const schedulePanelStyle = useFloatingPanelStyle(anchorRef, scheduleOpen, 224);

  useEffect(() => {
    if (!menuOpen && !scheduleOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setScheduleOpen(false);
      }
    };
    const onPointerDown = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-order-row-floating-panel]")) return;
      setMenuOpen(false);
      setScheduleOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen, scheduleOpen]);

  const [bulkConfirm] = useAdminBulkApprovalConfirmMutation();
  const [bulkCancel] = useAdminBulkApprovalCancelMutation();
  const [ensureShipmentMut] = useAdminFulfillmentEnsureShipmentMutation();
  const [assignShipMut] = useAdminFulfillmentAssignShipMutation();
  const [schedulePickupMut] = useAdminFulfillmentSchedulePickupMutation();
  const [generateManifestMut] = useAdminFulfillmentManifestMutation();
  const [syncShiprocketMut] = useAdminFulfillmentSyncShiprocketMutation();
  const [retryPickupMut] = useAdminFulfillmentRetryPickupMutation();
  const [cancelShipmentMut] = useAdminFulfillmentCancelShipmentMutation();

  const { data: pickupCalendarRes } = useGetAdminPickupCalendarQuery(
    { daysAhead: 45 },
    { skip: !scheduleOpen }
  );
  const allowedPickupDates = useMemo(
    () =>
      Array.isArray(pickupCalendarRes?.calendar?.allowedDates)
        ? pickupCalendarRes.calendar.allowedDates
        : [],
    [pickupCalendarRes?.calendar?.allowedDates]
  );

  useEffect(() => {
    if (!scheduleOpen) return;
    const def = pickupCalendarRes?.calendar?.defaultDate;
    if (def && allowedPickupDates.includes(def)) {
      setPickupDate(def);
    } else if (!pickupDate) {
      setPickupDate(addLocalDaysYmd(1));
    }
  }, [scheduleOpen, pickupCalendarRes?.calendar?.defaultDate, allowedPickupDates, pickupDate]);

  const actionCtx = useMemo(
    () => ({
      orderId,
      shippingProvider: order?.shippingProvider,
      bulkConfirm,
      bulkCancel,
      ensureShipment: ensureShipmentMut,
      assignShip: assignShipMut,
      schedulePickup: schedulePickupMut,
      generateManifest: generateManifestMut,
      syncShiprocket: syncShiprocketMut,
      retryPickup: retryPickupMut,
      cancelShipment: cancelShipmentMut,
      externalLinks,
      pickupDate,
      onOpenDetail,
    }),
    [
      orderId,
      order?.shippingProvider,
      bulkConfirm,
      bulkCancel,
      ensureShipmentMut,
      assignShipMut,
      schedulePickupMut,
      generateManifestMut,
      syncShiprocketMut,
      retryPickupMut,
      cancelShipmentMut,
      externalLinks,
      pickupDate,
      onOpenDetail,
    ]
  );

  const run = useCallback(
    async (key) => {
      if (!orderId || busy) return;
      setBusy(true);
      setMenuOpen(false);
      try {
        await executeAction(key, actionCtx);
        onFeedback?.({ type: "ok", orderId });
      } catch (e) {
        const text = mutationErrorToString(e);
        if (text) onFeedback?.({ type: "err", orderId, text });
      } finally {
        setBusy(false);
      }
    },
    [orderId, busy, actionCtx, onFeedback]
  );

  const menuItems = useMemo(() => {
    const keys = [
      "accept",
      "reject",
      "shipNow",
      "retryPickup",
      "schedulePickup",
      "generateManifest",
      "downloadManifest",
      "downloadLabel",
      "downloadTaxInvoice",
      "syncShiprocket",
      "refreshTracking",
      "openShiprocketSupport",
      "openShiprocket",
      "cancelShipment",
      "track",
      "openDetail",
    ];
    return keys.filter((k) => caps[k] && k !== primaryKey);
  }, [caps, primaryKey]);

  const primaryTitle = blockReasons[primaryKey] || undefined;

  if (!orderId) return null;

  return (
    <div
      ref={anchorRef}
      className={`relative flex items-center justify-center gap-1 ${busy ? "opacity-60" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {caps[primaryKey] ? (
        <button
          type="button"
          disabled={busy}
          title={primaryTitle}
          onClick={(e) => {
            e.stopPropagation();
            if (primaryKey === "schedulePickup") {
              setScheduleOpen(true);
              return;
            }
            void run(primaryKey);
          }}
          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-800 rounded-md hover:bg-slate-900 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "…" : primaryLabel}
        </button>
      ) : null}
      {menuItems.length > 0 ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="px-2 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-md bg-white hover:bg-slate-50 disabled:opacity-50"
            aria-label="More actions"
          >
            ▾
          </button>
          {menuOpen && menuPanelStyle
            ? createPortal(
                <div
                  data-order-row-floating-panel=""
                  style={menuPanelStyle}
                  className="rounded-lg border border-slate-200 bg-white shadow-xl py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {menuItems.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      title={blockReasons[key] || undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (key === "schedulePickup") {
                          setScheduleOpen(true);
                          setMenuOpen(false);
                          return;
                        }
                        void run(key);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                    >
                      {ACTION_LABELS[key] || key}
                    </button>
                  ))}
                </div>,
                document.body
              )
            : null}
        </>
      ) : null}
      {scheduleOpen && schedulePanelStyle
        ? createPortal(
            <div
              data-order-row-floating-panel=""
              style={schedulePanelStyle}
              className="w-56 rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Pickup date</p>
              {allowedPickupDates.length > 0 ? (
                <select
                  value={allowedPickupDates.includes(pickupDate) ? pickupDate : allowedPickupDates[0]}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 mb-2"
                >
                  {allowedPickupDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  min={addLocalDaysYmd(0)}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 mb-2"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(String(pickupDate || "").trim())}
                  onClick={() => {
                    void run("schedulePickup");
                    setScheduleOpen(false);
                  }}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-md disabled:opacity-50"
                >
                  {busy ? "…" : "Schedule"}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="px-2 py-1.5 text-xs text-slate-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
