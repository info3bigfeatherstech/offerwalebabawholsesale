import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSendBulkWishlistReminderPushMutation } from '../../ADMIN_REDUX_MANAGEMENT/userAnalyticsApi';

const REASON_LABELS = {
  EMPTY_WISHLIST: 'Empty wishlist — skipped',
  NO_SUBSCRIPTION: 'No push subscription — skipped',
  ALREADY_SENT_TODAY: 'Already sent today — skipped',
  USER_NOT_IN_SCOPE_OR_NOT_FOUND: 'Not found — skipped',
  SEND_FAILED: 'Send failed',
};

function statusLabel(detail) {
  if (!detail) return 'Unknown';
  if (detail.status === 'sent') {
    return detail.devices > 1 ? `Sent (${detail.devices} devices)` : 'Sent';
  }
  if (detail.reason && REASON_LABELS[detail.reason]) return REASON_LABELS[detail.reason];
  if (detail.status === 'failed') return detail.reason || 'Failed';
  if (detail.status === 'skipped') return detail.reason || 'Skipped';
  return detail.status;
}

function statusTone(detail) {
  if (detail?.status === 'sent') return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  if (detail?.status === 'failed') return 'text-red-700 bg-red-50 border-red-100';
  return 'text-amber-700 bg-amber-50 border-amber-100';
}

const PHASE_META = {
  review: {
    title: 'Send Wishlist reminder push',
    subtitle: (n) => `Review ${n} recipient${n === 1 ? '' : 's'} before sending`,
  },
  sending: {
    title: 'Sending notifications',
    subtitle: () => 'Please wait — do not close this window',
  },
  done: {
    title: 'Delivery complete',
    subtitle: () => 'Wishlist reminder push notifications have been processed',
  },
  error: {
    title: 'Delivery failed',
    subtitle: () => 'Notifications could not be sent',
  },
};

const WishlistReminderPushModal = ({ isOpen, onClose, recipients = [] }) => {
  const [phase, setPhase] = useState('review');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [sendLocked, setSendLocked] = useState(false);
  const sendInFlightRef = useRef(false);
  const [sendWishlistReminderPush] = useSendBulkWishlistReminderPushMutation();

  const userIds = useMemo(
    () => recipients.map((r) => r._id).filter(Boolean),
    [recipients]
  );

  const withItems = recipients.filter((r) => (r.itemCount || 0) > 0).length;
  const emptyWishlist = recipients.length - withItems;
  const meta = PHASE_META[phase] || PHASE_META.review;

  useEffect(() => {
    if (!isOpen) {
      setPhase('review');
      setResult(null);
      setErrorMessage('');
      setSendLocked(false);
      sendInFlightRef.current = false;
      document.body.style.overflow = '';
      return undefined;
    }

    setPhase('review');
    setResult(null);
    setErrorMessage('');
    setSendLocked(false);
    sendInFlightRef.current = false;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || phase !== 'sending') return undefined;
    const blockEsc = (e) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', blockEsc);
    return () => document.removeEventListener('keydown', blockEsc);
  }, [isOpen, phase]);

  const handleSend = async () => {
    if (!userIds.length || sendInFlightRef.current || sendLocked) return;

    sendInFlightRef.current = true;
    setSendLocked(true);
    setPhase('sending');
    setErrorMessage('');

    try {
      const res = await sendWishlistReminderPush(userIds).unwrap();
      setResult(res);
      setPhase('done');
    } catch (err) {
      setErrorMessage(
        err?.data?.message || err?.message || 'Could not send Wishlist reminder notifications.'
      );
      setPhase('error');
      sendInFlightRef.current = false;
      setSendLocked(false);
    }
  };

  const detailRows = useMemo(() => {
    if (!result?.details?.length) return [];
    return result.details.filter((d) => d.userId);
  }, [result]);

  if (!isOpen) return null;

  const canClose = phase !== 'sending';

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={canClose ? onClose : undefined}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-reminder-push-modal-title"
          className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`px-6 py-5 text-white ${
              phase === 'error'
                ? 'bg-gradient-to-r from-red-600 to-rose-600'
                : phase === 'done'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : phase === 'sending'
                    ? 'bg-gradient-to-r from-slate-700 to-slate-900'
                    : 'bg-gradient-to-r from-violet-600 to-purple-600'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="cart-reminder-push-modal-title" className="text-lg font-bold tracking-tight">
                  {meta.title}
                </h3>
                <p className="text-white/85 text-sm mt-1">
                  {meta.subtitle(recipients.length)}
                </p>
              </div>
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="px-6 py-5 min-h-[220px]">
            {phase === 'review' && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {recipients.length} selected
                  </span>
                  {withItems > 0 && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
                      {withItems} with wishlist items
                    </span>
                  )}
                  {emptyWishlist > 0 && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-100">
                      {emptyWishlist} Empty wishlist — will skip
                    </span>
                  )}
                </div>

                <ul className="max-h-56 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
                  {recipients.map((r) => (
                    <li
                      key={r._id}
                      className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2.5 border border-slate-100"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {r.name || 'Customer'}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{r.email || '—'}</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase shrink-0 px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-100">
                        Wishlist: {r.itemCount || 0}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Only customers who enabled notifications on their device will receive a push.
                  Others are skipped automatically.
                </p>
              </>
            )}

            {phase === 'sending' && (
              <div className="py-10 flex flex-col items-center text-center">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                  <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
                </div>
                <p className="text-base font-semibold text-slate-900">Sending push notifications</p>
                <p className="text-sm text-slate-500 mt-2 max-w-sm">
                  Delivering to {recipients.length} recipient{recipients.length === 1 ? '' : 's'}.
                </p>
              </div>
            )}

            {phase === 'done' && result && (
              <div className="py-2">
                <p className="text-sm text-slate-500 text-center mb-4">{result.message}</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{result.sent ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Sent</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{result.skipped ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Skipped</p>
                  </div>
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{result.failed ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">Failed</p>
                  </div>
                </div>

                {detailRows.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto space-y-1.5 text-xs border border-slate-100 rounded-xl p-2 bg-slate-50">
                    {detailRows.map((d, i) => (
                      <li
                        key={d.userId || i}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${statusTone(d)}`}
                      >
                        <span className="truncate font-medium">{d.userId}</span>
                        <span className="shrink-0 font-bold">{statusLabel(d)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {phase === 'error' && (
              <div className="py-8 text-center">
                <p className="text-lg font-bold text-slate-900">Could not complete delivery</p>
                <p className="text-sm text-red-600 mt-2 px-2 leading-relaxed">{errorMessage}</p>
                <p className="text-xs text-slate-500 mt-4">
                  Verify VAPID keys on the server and try again.
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
            {phase === 'review' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sendLocked}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!userIds.length || sendLocked}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm disabled:opacity-50"
                >
                  Send {recipients.length} notification{recipients.length === 1 ? '' : 's'}
                </button>
              </>
            )}
            {phase === 'done' && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
              >
                Done
              </button>
            )}
            {phase === 'error' && (
              <>
                <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Close
                </button>
                <button type="button" onClick={handleSend} className="px-5 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl">
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WishlistReminderPushModal;
