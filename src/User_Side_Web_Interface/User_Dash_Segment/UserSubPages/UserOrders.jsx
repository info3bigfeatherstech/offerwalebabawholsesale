import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { createPortal } from "react-dom";
import {
  fetchUserOrders,
  fetchOrderById,
  trackOrder,
  cancelOrder,
  clearOrderErrors,
  clearActiveOrder,
  initiatePendingOrderPayment,
  createReturnRequest,
  sendReturnChatMessage,
  fetchReturnChat,
  selectOrders,
  selectActiveOrder,
  selectTracking,
  selectOrderLoading,
  selectOrderError,
} from "../../../Components/REDUX_FEATURES/REDUX_SLICES/orderSlice";
import {
  verifyRazorpayPayment,
  selectPaymentVerification,
  resetPaymentVerification,
} from "../../../Components/REDUX_FEATURES/REDUX_SLICES/checkoutSlice/checkoutSlice";
import { selectUser } from "../../../Components/REDUX_FEATURES/REDUX_SLICES/authApi/authSlice";
import RazorpayCheckout, {
  PaymentLoadingModal,
  PaymentErrorModal,
} from "../../CHECKOUT/RazorpayCheckout/RazorpayCheckout";
import {
  Package, Truck, CheckCircle, ChevronRight, RefreshCw,
  XCircle, Clock, AlertCircle, ArrowLeft, MapPin,
  Loader2, ShoppingBag, CreditCard,
  MessageSquare, Send, X, Star,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isCancellationRefundOrder,
  isProductReturnOrder,
  cancellationRefundHeadline,
  cancellationRefundDetail,
  productReturnStatusLabel,
} from "../../../utils/orderRefundDisplay";
import axiosInstance from "../../../SERVICES/Wholesaleaxios";
import OrderItemReviewModal from "./OrderItemReviewModal";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const fmtDateTime = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/** User can resume Razorpay for an unpaid online order (matches backend initiate-pending rules). */
function isPaymentWindowExpired(order) {
  if (!order?.paymentHoldExpiresAt) return false;
  return new Date(order.paymentHoldExpiresAt).getTime() < Date.now();
}

function canResumeOnlinePayment(order) {
  if (!order) return false;
  if (order.orderStatus !== "pending") return false;
  if (order.paymentStatus !== "pending") return false;
  if (String(order.paymentInfo?.method || "").toLowerCase() !== "online") return false;
  if (Number(order.amountPaidInr) > 0.01) return false;
  if (isPaymentWindowExpired(order)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    color: "bg-amber-100 text-amber-700",
    icon: <Clock size={11} />,
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-blue-100 text-blue-700",
    icon: <CheckCircle size={11} />,
  },
  processing: {
    label: "Processing",
    color: "bg-purple-100 text-purple-700",
    icon: <RefreshCw size={11} className="animate-spin" />,
  },
  shipped: {
    label: "Shipped",
    color: "bg-indigo-100 text-indigo-700",
    icon: <Truck size={11} />,
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "bg-cyan-100 text-cyan-700",
    icon: <Truck size={11} />,
  },
  delivered: {
    label: "Delivered",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle size={11} />,
  },
  return_requested: {
    label: "Return Requested",
    color: "bg-orange-100 text-orange-700",
    icon: <RefreshCw size={11} className="animate-spin" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-600",
    icon: <XCircle size={11} />,
  },
  payment_failed: {
    label: "Payment Failed",
    color: "bg-red-100 text-red-600",
    icon: <XCircle size={11} />,
  },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tracking timelines (Layer A = order steps) — ecom parity
// ─────────────────────────────────────────────────────────────────────────────
const TrackingTimeline = ({ timeline = [], showLocation = false, useDateTime = false }) => {
  if (!timeline.length) return null;

  return (
    <div className="space-y-0">
      {timeline.map((step, i) => (
        <div key={`${step.status}-${i}-${step.timestamp || ""}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center mt-1 ${
                step.completed ? "bg-black border-black" : "bg-white border-gray-200"
              }`}
            >
              {step.completed && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
            </div>
            {i < timeline.length - 1 && (
              <div
                className={`w-0.5 flex-1 min-h-[20px] my-1 ${
                  step.completed ? "bg-black" : "bg-gray-200"
                }`}
              />
            )}
          </div>

          <div className="pb-4 min-w-0">
            <p
              className={`text-xs font-black leading-snug ${
                step.completed ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {step.status}
            </p>
            {showLocation && step.location && (
              <p className="text-[10px] text-gray-500 font-medium mt-0.5">{step.location}</p>
            )}
            {step.timestamp && (
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                {useDateTime ? fmtDateTime(step.timestamp) : fmtDate(step.timestamp)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const UserOrderTrackingPanel = ({ tracking }) => {
  const simpleTimeline =
    Array.isArray(tracking?.simpleTimeline) && tracking.simpleTimeline.length > 0
      ? tracking.simpleTimeline
      : Array.isArray(tracking?.timeline)
        ? tracking.timeline
        : [];

  const summaryHeadline = tracking?.statusSummary?.headline;

  return (
    <div className="space-y-4">
      {summaryHeadline && (
        <p className="text-sm font-bold text-gray-900 leading-snug">{summaryHeadline}</p>
      )}

      {tracking?.estimatedDelivery && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Est. delivery:{" "}
          <span className="text-gray-600 normal-case tracking-normal font-semibold">
            {fmtDate(tracking.estimatedDelivery)}
          </span>
        </p>
      )}

      {simpleTimeline.length > 0 ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Order progress
          </p>
          <TrackingTimeline timeline={simpleTimeline} />
        </div>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Order Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────
const OrderDetail = ({ orderId, onBack, onCancel, isCancelling, cancelError }) => {
  const dispatch = useDispatch();
  const order = useSelector(selectActiveOrder);
  console.log("order", order);
  
  const user = useSelector(selectUser);
  const tracking = useSelector(selectTracking(orderId));
  const loading = useSelector(selectOrderLoading);
  const error = useSelector(selectOrderError);
  const initiatePaymentLoading = useSelector((s) => s.orders.loading.initiatePayment);
  const initiatePaymentError = useSelector((s) => s.orders.error.initiatePayment);
  const returnRequestLoading = useSelector((s) => s.orders.loading.returnRequest);
  const returnRequestError = useSelector((s) => s.orders.error.returnRequest);
  const paymentVerification = useSelector(selectPaymentVerification);
  const navigate = useNavigate();

  const [showTracking, setShowTracking] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showRazorpay, setShowRazorpay] = useState(false);
  const [razorpayBundle, setRazorpayBundle] = useState(null);
  const [razorpayClientError, setRazorpayClientError] = useState(null);
  const [returnReasonType, setReturnReasonType] = useState("damaged");
  const [returnReasonMessage, setReturnReasonMessage] = useState("");
  const [returnProofVideo, setReturnProofVideo] = useState(null);
  const [returnProofImages, setReturnProofImages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const chatEndRef = useRef(null);
  /** productId → { canReview, alreadyReviewed, productSlug } from review eligibility API */
  const [orderReviewItems, setOrderReviewItems] = useState({});
  const [orderReviewEligible, setOrderReviewEligible] = useState(false);
  const [reviewModal, setReviewModal] = useState(null);

  useEffect(() => {
    let interval;
    if (isChatOpen && orderId) {
      dispatch(fetchReturnChat(orderId));
      interval = setInterval(() => dispatch(fetchReturnChat(orderId)), 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isChatOpen, orderId, dispatch]);

  useEffect(() => {
    if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [order?.returnInfo?.chat, isChatOpen]);

  const handleSendChatMessage = async (event) => {
    event.preventDefault();
    if (!chatMessage.trim()) return;
    try {
      await dispatch(
        sendReturnChatMessage({ orderId, message: chatMessage })
      ).unwrap();
      setChatMessage("");
    } catch (sendError) {
      toast.error(sendError?.message || "Failed to send message");
    }
  };

  useEffect(() => {
    dispatch(fetchOrderById(orderId));
    return () => {
      dispatch(clearActiveOrder());
      dispatch(resetPaymentVerification());
      setRazorpayBundle(null);
      setShowRazorpay(false);
      setRazorpayClientError(null);
      setOrderReviewItems({});
      setOrderReviewEligible(false);
      setReviewModal(null);
    };
  }, [orderId, dispatch]);

  useEffect(() => {
    if (!order?.orderId || String(order.orderId) !== String(orderId)) return;
    const status = String(order.orderStatus || "").toLowerCase();
    if (status !== "delivered" && status !== "return_requested") {
      setOrderReviewItems({});
      setOrderReviewEligible(false);
      return undefined;
    }

    let cancelled = false;
    const loadReviewItems = async () => {
      try {
        const res = await axiosInstance.get(
          `/product-reviews/order/${order.orderId}/items`
        );
        if (cancelled) return;
        setOrderReviewEligible(Boolean(res.data?.eligible));
        const map = {};
        for (const row of Array.isArray(res.data?.items) ? res.data.items : []) {
          if (!row?.productId) continue;
          map[String(row.productId)] = row;
        }
        setOrderReviewItems(map);
      } catch {
        if (!cancelled) {
          setOrderReviewItems({});
          setOrderReviewEligible(false);
        }
      }
    };
    loadReviewItems();

    return () => {
      cancelled = true;
    };
  }, [order?.orderId, order?.orderStatus, orderId]);

  const refreshOrderReviewItems = useCallback(async () => {
    if (!order?.orderId) return;
    try {
      const res = await axiosInstance.get(
        `/product-reviews/order/${order.orderId}/items`
      );
      setOrderReviewEligible(Boolean(res.data?.eligible));
      const map = {};
      for (const row of Array.isArray(res.data?.items) ? res.data.items : []) {
        if (!row?.productId) continue;
        map[String(row.productId)] = row;
      }
      setOrderReviewItems(map);
    } catch {
      /* keep previous map */
    }
  }, [order?.orderId]);

  const handleTrack = () => {
    if (!tracking) dispatch(trackOrder(orderId));
    setShowTracking((v) => !v);
  };

  const handleContinuePayment = useCallback(async () => {
    if (!order?.orderId) return;
    setRazorpayClientError(null);
    dispatch(resetPaymentVerification());
    try {
      const data = await dispatch(initiatePendingOrderPayment(order.orderId)).unwrap();
      const key = data.razorpayKeyId;
      const rzOrder = data.razorpayOrder;
      if (!key || !rzOrder?.id) {
        throw new Error("Payment could not be started. Please try again.");
      }
      setRazorpayBundle({ key, order: rzOrder });
      setShowRazorpay(true);
    } catch {
      /* error in initiatePaymentError */
    }
  }, [dispatch, order]);

  const handleRazorpaySuccess = useCallback(
    async (response) => {
      setShowRazorpay(false);
      setRazorpayBundle(null);
      const oid = order?.orderId || response?.notes?.orderId;
      if (!oid) {
        toast.error("Missing order reference. Please contact support.", { theme: "dark" });
        return;
      }
      try {
        await dispatch(
          verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            orderId: oid,
          })
        ).unwrap();
        await dispatch(fetchOrderById(oid)).unwrap();
        dispatch(fetchUserOrders());
        dispatch(resetPaymentVerification());
        toast.success("Payment successful! Your order is confirmed.", { theme: "dark", autoClose: 3500 });
        setTimeout(()=>{
          navigate("/account/userorders")
        })
      } catch (e) {
        console.error(e);
        /* verify error surfaced via paymentVerification + modal */
      }
    },
    [dispatch, order?.orderId]
  );

  const handleRazorpayFailure = useCallback((msg) => {
    setShowRazorpay(false);
    setRazorpayBundle(null);
    setRazorpayClientError(msg || "Payment failed. Please try again.");
  }, []);

  const handleRazorpayClose = useCallback(() => {
    setShowRazorpay(false);
    setRazorpayBundle(null);
  }, []);

  /** Verify / Razorpay client failures — initiate errors stay inline only */
  const modalError = paymentVerification?.error || razorpayClientError || null;

  const holdExpired = order && isPaymentWindowExpired(order);

  if (loading?.fetchOne) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm font-bold">Loading order…</span>
      </div>
    );
  }

  if (error?.fetchOne || !order) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-500 font-bold">{error.fetchOne?.message || "Order not found"}</p>
        <button onClick={onBack} className="mt-4 text-xs font-black uppercase text-gray-400 hover:text-black cursor-pointer">
          ← Back
        </button>
      </div>
    );
  }

  const canCancel = ["pending", "confirmed"].includes(order.orderStatus);
  const returnStatus = String(order.returnInfo?.status || "").toLowerCase();
  const returnWindowDays = order.returnInfo?.windowDays ?? 2;
  const deliveredAt = order.shipmentInfo?.deliveredAt
    ? new Date(order.shipmentInfo.deliveredAt)
    : null;
  const deliveredAtValid = Boolean(
    deliveredAt && !Number.isNaN(deliveredAt.getTime())
  );
  const returnDeadlineAt = deliveredAtValid
    ? new Date(deliveredAt.getTime() + returnWindowDays * 24 * 60 * 60 * 1000)
    : null;
  const returnWindowExpired = Boolean(
    returnDeadlineAt && Date.now() > returnDeadlineAt.getTime()
  );
  const isCancelRefund = isCancellationRefundOrder(order);
  const isProductReturn = isProductReturnOrder(order);
  const orderStatusLower = String(order.orderStatus || "").toLowerCase();
  const paymentStatusLower = String(order.paymentStatus || "").toLowerCase();
  const refundedTotalInr = Array.isArray(order.refundHistory)
    ? order.refundHistory.reduce(
        (total, refund) => total + (Number(refund.amountInr) || 0),
        0
      )
    : Number(order.returnInfo?.refundAmount) || 0;
  const activeItems = Array.isArray(order.items) ? order.items : [];
  const removedArchive = Array.isArray(order.removedItemsArchive) ? order.removedItemsArchive : [];
  const showItemsAsCancelled =
    orderStatusLower === "cancelled" &&
    (Boolean(order.paymentInfo?.itemsUnavailableCancel) ||
      order.paymentInfo?.cancellationReason === "admin_amended_empty" ||
      activeItems.some((it) => it.unavailable || it.lineStatus === "cancelled_unavailable"));
  const canRaiseReturn =
    !isCancelRefund &&
    orderStatusLower === "delivered" &&
    deliveredAtValid &&
    !returnWindowExpired &&
    !returnStatus;
  const showProductReturnCard = isProductReturn || canRaiseReturn;
  const unreadCount = isChatOpen
    ? 0
    : order.returnInfo?.chat?.filter(
        (message) =>
          message.sender === "admin" &&
          (!order.returnInfo.userLastRead ||
            new Date(message.createdAt) > new Date(order.returnInfo.userLastRead))
      ).length || 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors cursor-pointer text-xs font-black uppercase tracking-widest"
      >
        <ArrowLeft size={14} /> All Orders
      </button>

      {/* Order header */}
      <div className="bg-white rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black text-gray-900">{order.orderId}</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
              {fmtDate(order.createdAt)}
            </p>
          </div>
          <StatusBadge status={order.orderStatus} />
        </div>

        {Array.isArray(order.customerFacingNotes) && order.customerFacingNotes.length > 0 && (
          <div className="mb-5 space-y-2">
            {order.customerFacingNotes.map((note, idx) => (
              <div
                key={note._id || idx}
                className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                  Order update
                </p>
                <p className="mt-1 text-sm text-slate-800 leading-relaxed">
                  {note.message}
                </p>
                {note.createdAt && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {fmtDate(note.createdAt)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          {[
            { label: "Subtotal", value: fmt(order.subtotal) },
            { label: "Delivery", value: order.deliveryCharges === 0 ? "FREE" : fmt(order.deliveryCharges) },
            { label: "Tax", value: fmt(order.tax) },
            { label: "Total", value: fmt(order.totalAmount), bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label}>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
              <p className={`text-sm mt-1 ${bold ? "font-black text-gray-900" : "font-bold text-gray-700"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {(paymentStatusLower === "refunded" ||
          paymentStatusLower === "partially_refunded" ||
          refundedTotalInr > 0.005) && (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
              Refund
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {paymentStatusLower === "refunded"
                ? `Refund of ${fmt(refundedTotalInr || order.totalAmount)} has been processed for this order.`
                : `A refund of ${fmt(refundedTotalInr)} has been processed.`}
            </p>
          </div>
        )}

        {String(order?.paymentInfo?.method || "").toLowerCase() === "online" &&
          order.orderStatus === "pending" &&
          order.paymentStatus === "pending" && (
            <div className="mt-6 pt-6 border-t border-amber-100 space-y-3">
              <div className="flex items-start gap-3">
                <CreditCard className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-gray-900">Payment required</h3>
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    Your cart was turned into this order. Complete payment to confirm it.
                  </p>
                  {order.paymentHoldExpiresAt && !holdExpired && (
                    <p className="text-[11px] text-amber-800 font-bold mt-2">
                      Complete before {fmtDateTime(order.paymentHoldExpiresAt)}
                    </p>
                  )}
                </div>
              </div>
              {initiatePaymentError?.message && (
                <p className="text-xs text-red-600 font-bold">{initiatePaymentError.message}</p>
              )}
              {holdExpired ? (
                <p className="text-xs text-red-600 font-bold leading-relaxed">
                  The payment window for this order has expired. Please place a new order.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleContinuePayment}
                  disabled={initiatePaymentLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-black text-white text-xs font-black uppercase tracking-widest px-6 py-3.5 rounded-2xl hover:bg-[#F7A221] hover:text-black transition-all disabled:opacity-50 cursor-pointer"
                >
                  {initiatePaymentLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CreditCard size={16} />
                  )}
                  Continue payment
                </button>
              )}
            </div>
          )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-[32px] p-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">
          Items ({activeItems.length + removedArchive.length})
        </h3>
        <div className="space-y-4">
          {activeItems.map((item, i) => {
            const image = item.productId?.images?.[0]?.url || item.thumbnailUrl || null;
            const name = item.productId?.name || item.productId?.title || "Product";
            const price = item.priceSnapshot?.sale ?? item.priceSnapshot?.base;
            const isUnavailable =
              showItemsAsCancelled ||
              item.unavailable ||
              item.lineStatus === "cancelled_unavailable";
            const productIdStr = item.productId?._id
              ? String(item.productId._id)
              : item.productId
                ? String(item.productId)
                : null;
            const reviewMeta = productIdStr ? orderReviewItems[productIdStr] : null;
            const showWriteReview =
              !isUnavailable &&
              orderReviewEligible &&
              Boolean(reviewMeta?.canReview) &&
              Boolean(productIdStr);
            const showReviewed =
              !isUnavailable &&
              Boolean(reviewMeta?.alreadyReviewed) &&
              Boolean(productIdStr);

            return (
              <div
                key={`active-${i}`}
                className={`flex flex-col gap-2 ${isUnavailable ? "opacity-80" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl overflow-hidden flex-shrink-0">
                    {image ? (
                      <img
                        src={image}
                        alt={name}
                        className={`w-full h-full object-cover ${isUnavailable ? "grayscale" : ""}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={18} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-black ${
                        isUnavailable ? "text-gray-500 line-through" : "text-gray-900"
                      }`}
                    >
                      {name}
                    </p>
                    {isUnavailable && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mt-0.5">
                        Unavailable
                      </p>
                    )}
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      Qty: {item.quantity} × {fmt(price)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-black ${
                      isUnavailable ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {fmt(item.lineTotal ?? price * item.quantity)}
                  </p>
                </div>

                {showWriteReview && (
                  <div className="flex items-center gap-3 pl-0 sm:pl-[4.5rem]">
                    <button
                      type="button"
                      onClick={() =>
                        setReviewModal({
                          productId: productIdStr,
                          productName: name,
                          productImage: image,
                          variantId: item.variantId ? String(item.variantId) : null,
                        })
                      }
                      className="group inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full bg-zinc-900 text-white text-[11px] font-semibold tracking-wide shadow-sm hover:bg-[#F7A221] hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 group-hover:bg-black/10">
                        <Star
                          size={12}
                          className="fill-[#F7A221] text-[#F7A221] group-hover:fill-zinc-900 group-hover:text-zinc-900"
                        />
                      </span>
                      Write a review
                    </button>
                    <span className="hidden sm:inline text-[11px] text-gray-400 font-medium">
                      Help others with your experience
                    </span>
                  </div>
                )}
                {showReviewed && (
                  <div className="flex items-center gap-2 pl-0 sm:pl-[4.5rem]">
                    <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-semibold tracking-wide">
                      <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                      Review submitted
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {removedArchive.map((item, i) => {
            const name = item?.productName || "Product";
            const price = item?.priceSnapshot?.sale ?? item?.priceSnapshot?.base ?? null;
            const qty = Number(item?.quantity) || 0;
            const lineTotal =
              item?.lineTotal != null
                ? Number(item.lineTotal)
                : Number(item?.priceSnapshot?.total) ||
                  (Number(price) || 0) * qty;
            const badge =
              item?.reason === "qty_reduced"
                ? "Qty reduced"
                : item?.reason === "order_cancelled_empty"
                  ? "Removed — order cancelled"
                  : "Removed — unavailable";

            return (
              <div
                key={`removed-${i}`}
                className="flex items-center gap-4 opacity-80"
              >
                <div className="w-14 h-14 bg-gray-100 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                  <Package size={18} className="text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-gray-500 line-through break-words leading-snug">
                      {name}
                    </p>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                      {badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Qty: {qty}
                    {price != null ? ` × ${fmt(price)}` : ""}
                    {item?.sku ? ` · SKU ${item.sku}` : ""}
                  </p>
                </div>
                <p className="text-sm font-black text-gray-400 line-through shrink-0 text-right">
                  {fmt(lineTotal)}
                </p>
              </div>
            );
          })}

          {activeItems.length === 0 && removedArchive.length === 0 && (
            <p className="text-sm text-gray-400 font-medium">
              No item details available for this order.
            </p>
          )}
        </div>
      </div>

      {/* Delivery address */}
      {order.addressSnapshot && (
        <div className="bg-white rounded-[32px] p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={14} className="text-[#F7A221]" />
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
              Delivery Address
            </h3>
          </div>
          <p className="text-sm font-black text-gray-900">{order.addressSnapshot.fullName}</p>
          <p className="text-xs text-gray-500 font-medium mt-1">
            {[
              order.addressSnapshot.houseNumber,
              order.addressSnapshot.area,
              order.addressSnapshot.landmark,
              order.addressSnapshot.addressLine1,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="text-xs font-bold text-gray-700 mt-0.5">
            {order.addressSnapshot.city}, {order.addressSnapshot.state} —{" "}
            {order.addressSnapshot.postalCode}
          </p>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            {order.addressSnapshot.phone}
          </p>
        </div>
      )}

      {/* Tracking */}
      <div className="bg-white rounded-[32px] p-6">
        <button
          onClick={handleTrack}
          className="flex items-center justify-between w-full cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Truck size={14} className="text-[#F7A221]" />
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">
              Track Order
            </h3>
          </div>
          {loading.track ? (
            <Loader2 size={14} className="animate-spin text-gray-400" />
          ) : (
            <ChevronRight
              size={14}
              className={`text-gray-400 transition-transform ${showTracking ? "rotate-90" : ""}`}
            />
          )}
        </button>

        {showTracking && tracking && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            {tracking.trackingNumber && (
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                Tracking: <span className="text-gray-700">{tracking.trackingNumber}</span>
                {tracking.courier && (
                  <span className="ml-2">via {tracking.courier}</span>
                )}
              </p>
            )}
            <UserOrderTrackingPanel tracking={tracking} />
          </div>
        )}
      </div>

      {/* Return request */}
      {showProductReturnCard && (
        <div className="bg-white rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">
              Return Request
            </h3>
            {returnStatus && isProductReturn && (
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                {productReturnStatusLabel(returnStatus)}
              </span>
            )}
          </div>

          {canRaiseReturn ? (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                Returns are available only for damaged or wrong item deliveries.
                Please provide one unboxing video and at least one image.
              </p>
              {!showReturnForm ? (
                <button
                  type="button"
                  onClick={() => setShowReturnForm(true)}
                  className="w-full sm:w-auto bg-black text-white text-xs font-black uppercase tracking-widest px-5 py-3 rounded-2xl hover:bg-[#F7A221] hover:text-black transition-all"
                >
                  Raise Return Request
                </button>
              ) : (
                <div className="space-y-3 pt-2">
                  <select
                    value={returnReasonType}
                    onChange={(event) => setReturnReasonType(event.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm"
                  >
                    <option value="damaged">Damaged product</option>
                    <option value="wrong_item">Wrong item received</option>
                  </select>
                  <textarea
                    value={returnReasonMessage}
                    onChange={(event) => setReturnReasonMessage(event.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="Describe what is damaged/wrong..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm resize-none"
                  />
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">
                      Submit Unboxing Video
                    </p>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        setReturnProofVideo(event.target.files?.[0] || null)
                      }
                      className="text-xs w-full"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">
                      Proof Images (1-3)
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) =>
                        setReturnProofImages(
                          Array.from(event.target.files || []).slice(0, 3)
                        )
                      }
                      className="text-xs w-full"
                    />
                  </div>
                  {returnRequestError?.message && (
                    <p className="text-xs font-bold text-red-600">
                      {returnRequestError.message}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReturnForm(false)}
                      disabled={returnRequestLoading}
                      className="w-full sm:w-auto px-4 py-3 text-xs font-black uppercase tracking-widest border border-gray-200 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={returnRequestLoading}
                      onClick={async () => {
                        if (!returnReasonMessage.trim()) {
                          toast.error("Please describe the issue.", { theme: "dark" });
                          return;
                        }
                        if (!returnProofVideo) {
                          toast.error("Please upload an unboxing video.", { theme: "dark" });
                          return;
                        }
                        if (!returnProofImages.length) {
                          toast.error("Please upload at least one proof image.", { theme: "dark" });
                          return;
                        }
                        try {
                          await dispatch(
                            createReturnRequest({
                              orderId: order.orderId,
                              reasonType: returnReasonType,
                              reasonMessage: returnReasonMessage,
                              proofVideo: returnProofVideo,
                              proofImages: returnProofImages,
                            })
                          ).unwrap();
                          await dispatch(fetchOrderById(order.orderId)).unwrap();
                          dispatch(fetchUserOrders());
                          setShowReturnForm(false);
                          setReturnReasonMessage("");
                          setReturnProofVideo(null);
                          setReturnProofImages([]);
                          toast.success("Return request submitted.", { theme: "dark" });
                        } catch {
                          // Redux error is rendered above.
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-black text-white disabled:opacity-50"
                    >
                      {returnRequestLoading ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">
                {returnStatus && isProductReturn
                  ? `Return status: ${productReturnStatusLabel(returnStatus)}`
                  : returnWindowExpired
                    ? "Return window expired. You can no longer raise a return request."
                    : `Return request is available within ${returnWindowDays} days of delivery.`}
              </p>
              {order.returnInfo?.decisionReason && (
                <div className={`border rounded-xl p-3 text-xs font-medium ${
                  returnStatus === "rejected"
                    ? "bg-red-50 border-red-100 text-red-700"
                    : "bg-emerald-50 border-emerald-100 text-emerald-700"
                }`}>
                  <span className="font-bold block uppercase tracking-wider text-[10px] mb-1">
                    {returnStatus === "rejected"
                      ? "Reason for Rejection:"
                      : "Decision Note:"}
                  </span>
                  {order.returnInfo.decisionReason}
                </div>
              )}
              {order.returnInfo?.requestedAt && (
                <div className="relative inline-block mt-2">
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-xs font-black uppercase tracking-wider rounded-xl bg-white hover:bg-slate-50 text-slate-700"
                  >
                    <MessageSquare size={14} />
                    Chat with Support
                  </button>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-bold text-white items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cancellation refund */}
      {isCancelRefund && (
        <div className="bg-white rounded-[32px] p-6 border border-red-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">
              Cancellation refund
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
              {cancellationRefundHeadline(order)}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-600 font-medium leading-relaxed">
            {cancellationRefundDetail(order)}
          </p>
          {order.returnInfo?.refundId && (
            <p className="mt-2 text-[10px] text-gray-400 font-mono break-all">
              Ref ID: {order.returnInfo.refundId}
            </p>
          )}
        </div>
      )}

      {/* Cancel */}
      {/* {canCancel && (
        <div className="bg-white rounded-[32px] p-6">
          {cancelError && (
            <p className="text-xs text-red-500 font-bold mb-3">{cancelError.message}</p>
          )}

          {showCancelConfirm ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-gray-900">
                Are you sure you want to cancel this order?
              </p>
              <p className="text-xs text-gray-500 font-medium">
                This cannot be undone. Refund (if paid online) will be initiated automatically.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-xs font-black uppercase tracking-widest hover:border-black transition-all cursor-pointer"
                >
                  Keep Order
                </button>
                <button
                  onClick={() => onCancel(order.orderId)}
                  disabled={isCancelling}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-600 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isCancelling ? (
                    <Loader2 size={14} className="animate-spin mx-auto" />
                  ) : (
                    "Yes, Cancel"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              <XCircle size={14} /> Cancel Order
            </button>
          )}
        </div>
      )} */}

      {showRazorpay && razorpayBundle && order && (
        <RazorpayCheckout
          key={razorpayBundle.order.id}
          razorpayOrder={razorpayBundle.order}
          razorpayKey={razorpayBundle.key}
          orderId={order.orderId}
          totalAmount={order.totalAmount}
          userEmail={user?.email}
          userName={user?.name || order.addressSnapshot?.fullName}
          userPhone={order.addressSnapshot?.phone || user?.phone}
          onSuccess={handleRazorpaySuccess}
          onFailure={handleRazorpayFailure}
          onClose={handleRazorpayClose}
        />
      )}

      {paymentVerification?.loading && (
        <PaymentLoadingModal message="Verifying payment…" />
      )}

      {modalError && !paymentVerification?.loading && !showRazorpay && (
        <PaymentErrorModal
          error={modalError}
          onRetry={() => {
            setRazorpayClientError(null);
            dispatch(resetPaymentVerification());
            handleContinuePayment();
          }}
          onClose={() => {
            setRazorpayClientError(null);
            dispatch(resetPaymentVerification());
          }}
        />
      )}

      {isChatOpen && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[9998]"
            onClick={() => setIsChatOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[9999] w-full sm:w-[450px] bg-white shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Support Chat
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Order: {order.orderId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {order.returnInfo?.requestedAt && (() => {
                const requestedAt = new Date(order.returnInfo.requestedAt);
                const windowDays = order.returnInfo?.windowDays ?? 2;
                const remainingMs =
                  requestedAt.getTime() + windowDays * 24 * 60 * 60 * 1000 - Date.now();
                return remainingMs <= 0 ? (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-center text-[11px] text-red-700 font-medium">
                    This support chat session is closed (expired after {windowDays} days).
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-center text-[11px] text-amber-800 font-medium">
                    Support chat is active. Window closes in{" "}
                    {Math.ceil(remainingMs / (1000 * 60 * 60))} hours.
                  </div>
                );
              })()}

              {!order.returnInfo?.chat?.length ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                  <MessageSquare size={32} className="stroke-1 mb-2" />
                  <p className="text-xs font-medium">
                    No messages yet. Send a message to start the conversation.
                  </p>
                </div>
              ) : (
                order.returnInfo.chat.map((message, index) => {
                  const isUser = message.sender === "user";
                  return (
                    <div
                      key={`${message.createdAt}-${index}`}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div className={`max-w-[80%] rounded-[20px] px-3.5 py-2 text-xs leading-relaxed ${
                        isUser
                          ? "bg-black text-white rounded-br-none"
                          : "bg-white text-slate-800 border border-slate-100 rounded-bl-none"
                      }`}>
                        {message.message}
                      </div>
                      <span className="text-[9px] text-slate-400 mt-1 px-1">
                        {message.createdAt
                          ? new Date(message.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {(() => {
              const requestedAt = order.returnInfo?.requestedAt
                ? new Date(order.returnInfo.requestedAt)
                : null;
              const windowDays = order.returnInfo?.windowDays ?? 2;
              const expired = requestedAt
                ? Date.now() > requestedAt.getTime() + windowDays * 24 * 60 * 60 * 1000
                : true;
              if (expired) {
                return (
                  <div className="p-4 border-t border-slate-100 bg-slate-100 text-center text-xs font-semibold text-slate-500">
                    Chat disabled (support window expired)
                  </div>
                );
              }
              return (
                <form
                  onSubmit={handleSendChatMessage}
                  className="p-3 border-t border-slate-100 flex gap-2 items-center bg-white"
                >
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(event) => setChatMessage(event.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-hidden focus:border-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!chatMessage.trim() || loading.chat}
                    className="p-2.5 rounded-xl bg-black text-white disabled:opacity-50"
                  >
                    <Send size={14} />
                  </button>
                </form>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      <OrderItemReviewModal
        open={Boolean(reviewModal)}
        onClose={() => setReviewModal(null)}
        orderId={order?.orderId}
        productId={reviewModal?.productId}
        productName={reviewModal?.productName}
        productImage={reviewModal?.productImage}
        variantId={reviewModal?.variantId}
        onSuccess={refreshOrderReviewItems}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UserOrders — Main Component
// ─────────────────────────────────────────────────────────────────────────────
const UserOrders = () => {
  const dispatch = useDispatch();
  const location = useLocation(); 
  const orders = useSelector(selectOrders);
  const loading = useSelector(selectOrderLoading);
  const error = useSelector(selectOrderError);

  const [activeOrderId, setActiveOrderId] = useState( location.state?.openOrderId ?? null );

  useEffect(() => {
    dispatch(fetchUserOrders());
    return () => dispatch(clearOrderErrors());
  }, [dispatch]);

  const handleCancel = async (orderId) => {
    try {
      await dispatch(cancelOrder(orderId)).unwrap();
      setActiveOrderId(null); // go back to list
    } catch (e) {
      // error shown in OrderDetail
    }
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (activeOrderId) {
    return (
      <OrderDetail
        orderId={activeOrderId}
        onBack={() => setActiveOrderId(null)}
        onCancel={handleCancel}
        isCancelling={loading.cancel}
        cancelError={error.cancel}
      />
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading?.fetch) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 size={28} className="text-gray-300 animate-spin" />
        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">
          Loading orders…
        </p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error?.fetch) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <AlertCircle size={32} className="text-red-300" />
        <p className="text-gray-500 text-sm font-medium max-w-sm">
          {error.fetch.message || "Failed to load orders"}
        </p>
        <button
          onClick={() => dispatch(fetchUserOrders())}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-[#F7A221] text-white px-6 py-3 rounded-xl hover:bg-black transition-colors"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (orders?.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center">
          <ShoppingBag size={36} className="text-gray-200" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight mb-1">
            No orders yet
          </h2>
          <p className="text-gray-400 text-sm font-medium">
            Your order history will appear here
          </p>
        </div>
        <a
          href="/"
          className="bg-black text-white text-xs font-black uppercase tracking-[0.2em] px-8 py-4 rounded-2xl hover:bg-[#F7A221] hover:text-black transition-all"
        >
          Start Shopping
        </a>
      </div>
    );
  }

  // ── Order list ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fadeIn font-semibold">
      <header>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">Purchase History</h1>
        <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mt-1">
          {orders?.length} Order{orders?.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="space-y-4">
        {orders?.map((order) => {
          const cfg = STATUS_CONFIG[order.orderStatus] || STATUS_CONFIG.pending;

          return (
            <button
              key={order.orderId}
              onClick={() => setActiveOrderId(order.orderId)}
              className="group w-full text-left bg-gray-50 rounded-3xl p-6 border-2 border-transparent hover:border-black hover:bg-white transition-all duration-300 cursor-pointer"
            >
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-gray-300 flex-shrink-0">
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs md:text-sm lg:text-md text-gray-900">{order.orderId}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter mt-0.5">
                      {fmtDate(order.createdAt)}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={order.orderStatus} />
                    </div>
                    {canResumeOnlinePayment(order) && (
                      <p className="text-[10px] font-bold text-amber-700 mt-2">
                        Online payment pending — open to complete checkout
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-row sm:flex-col justify-between mb-4 sm:items-end pt-4 sm:pt-0">
                  <p className="text-sm md:text-md lg:text-lg font-black text-gray-900">{fmt(order.totalAmount)}</p>
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-black transition-colors mt-auto">
                    View Details <ChevronRight size={13} />
                  </div>
                </div>
                <div className="border lg:hidden md:hidden sm:hidden"></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default UserOrders;

// import React from 'react';
// import { Package, Truck, CheckCircle, ChevronRight } from 'lucide-react';

// const UserOrders = () => {
//   const orders = [
//     { id: 'ORD-88291', date: 'March 15, 2026', status: 'In Transit', total: '₹2,499', items: 2 },
//     { id: 'ORD-77210', date: 'March 02, 2026', status: 'Delivered', total: '₹1,200', items: 1 },
//   ];

//   return (
//     <div className="space-y-8 animate-fadeIn">
//       <header>
//         <h1 className="text-3xl font-black text-gray-900 tracking-tight">Purchase History</h1>
//         <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mt-1">Track & Manage Orders</p>
//       </header>

//       <div className="space-y-6">
//         {orders.map((order) => (
//           <div key={order.id} className="group bg-gray-50 rounded-3xl p-6 border-2 border-transparent hover:border-black hover:bg-white transition-all duration-300">
//             <div className="flex flex-col md:flex-row justify-between gap-6">
//               <div className="flex gap-4">
//                 <div className="w-20 h-20 bg-gray-200 rounded-2xl flex items-center justify-center text-gray-400">
//                    <Package size={32} />
//                 </div>
//                 <div>
//                   <h3 className="font-black text-lg text-gray-900">{order.id}</h3>
//                   <p className="text-sm font-bold text-gray-400 uppercase tracking-tighter">{order.date}</p>
//                   <div className="mt-2 flex items-center gap-2">
//                     <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
//                       order.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
//                     }`}>
//                       {order.status}
//                     </span>
//                   </div>
//                 </div>
//               </div>

//               <div className="flex flex-row md:flex-col justify-between md:items-end border-t md:border-t-0 pt-4 md:pt-0">
//                 <p className="text-2xl font-black text-gray-900">{order.total}</p>
//                 <button className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:text-black transition-colors">
//                   View Details <ChevronRight size={14} />
//                 </button>
//               </div>
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };

// export default UserOrders;