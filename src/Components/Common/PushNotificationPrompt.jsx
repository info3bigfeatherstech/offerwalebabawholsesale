import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  dismissPushPrompt,
  getNotificationPermission,
  recordPushPromptImpression,
  subscribeToWebPush,
} from '../../utils/pushNotifications';

const PENDING_LOGIN_KEY = 'owb_push_subscribe_after_login';

const PushNotificationPrompt = ({
  visible,
  onDismiss,
  isLoggedIn = false,
  onNeedLogin,
  brandName = 'OWB Wholesale',
}) => {
  const [loading, setLoading] = useState(false);
  const impressionRecordedRef = useRef(false);
  const permission = getNotificationPermission();
  const isDenied = permission === 'denied';

  useEffect(() => {
    if (!visible) return undefined;
    if (impressionRecordedRef.current) return undefined;
    impressionRecordedRef.current = true;
    recordPushPromptImpression({ isLoggedIn: Boolean(isLoggedIn) }).catch(() => {});
    return undefined;
  }, [visible, isLoggedIn]);

  const handleEnable = async () => {
    if (isDenied) {
      toast.info(
        'Notifications are blocked. Site settings → Notifications → Allow, then refresh.'
      );
      return;
    }

    if (!isLoggedIn) {
      try {
        sessionStorage.setItem(PENDING_LOGIN_KEY, '1');
      } catch {
        // ignore
      }
      toast.info('Please login to enable notifications.');
      onNeedLogin?.();
      return;
    }

    setLoading(true);
    try {
      await subscribeToWebPush();
      toast.success('Notifications enabled.');
      onDismiss?.();
    } catch (err) {
      toast.error(err?.message || 'Could not enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    dismissPushPrompt();
    onDismiss?.();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9100] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-4 sm:top-4 sm:justify-end sm:px-0 sm:pt-0"
      role="dialog"
      aria-label="Enable notifications"
    >
      <AnimatePresence>
        {visible ? (
          <motion.div
            key="owb-push-prompt"
            className="pointer-events-auto mx-auto w-full max-w-[min(100%,20.5rem)] sm:mx-0 sm:max-w-[22rem]"
            initial={{ opacity: 0, y: -56 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.85 }}
          >
            <figure
              className="relative overflow-hidden rounded-2xl bg-white p-3 transition-all duration-200 ease-in-out hover:scale-[1.02] sm:p-4"
              style={{
                boxShadow:
                  '0 0 0 1px rgba(0,0,0,.03), 0 2px 4px rgba(0,0,0,.05), 0 12px 24px rgba(0,0,0,.05)',
              }}
            >
              <span className="absolute inset-x-0 top-0 h-[2px] bg-[#F7A221]" aria-hidden />

              <div className="flex items-start gap-2.5 sm:gap-3">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl"
                  style={{ backgroundColor: isDenied ? '#9CA3AF' : '#F7A221' }}
                  aria-hidden
                >
                  <svg
                    className="h-4 w-4 text-black sm:h-[1.125rem] sm:w-[1.125rem]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight text-gray-900 sm:text-sm">
                        {isDenied ? 'Notifications blocked' : 'Allow notifications'}
                        <span className="font-normal text-gray-400"> · {brandName}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-gray-500 sm:text-xs">
                        {isDenied
                          ? 'Enable in browser site settings, then refresh.'
                          : 'Wishlist, deals & new product alerts — no spam.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDismiss}
                      disabled={loading}
                      className="-mr-0.5 -mt-0.5 shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Close"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3">
                    <button
                      type="button"
                      onClick={handleEnable}
                      disabled={loading}
                      className="rounded-full bg-black px-3.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-gray-900 active:scale-[0.98] disabled:opacity-60 sm:text-xs"
                    >
                      {loading ? 'Please wait…' : isDenied ? 'How to enable' : 'Allow'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDismiss}
                      disabled={loading}
                      className="rounded-full px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800 sm:text-xs"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            </figure>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default PushNotificationPrompt;
