import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  canOfferInstall,
  clearLegacyInstallDismiss,
  isIosDevice,
  isPwaInstalled,
  markExitShownThisSession,
  wasExitShownThisSession,
} from '../../utils/pwaInstallPrompt';
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  subscribeDeferredInstallPrompt,
} from '../../utils/pwaDeferredPrompt';

/**
 * Centered install modal — Magic UI notification-card look.
 * https://magicui.design/docs/components/animated-list
 */
const InstallAppPrompt = ({
  enabled = true,
  onVisibilityChange,
  brandName = 'OWB Wholesale',
}) => {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('open');
  const [installing, setInstalling] = useState(false);
  const [hasNative, setHasNative] = useState(() => Boolean(getDeferredInstallPrompt()));
  const openDismissedThisVisitRef = useRef(false);
  const installBtnRef = useRef(null);

  const setPromptVisible = useCallback(
    (next, nextMode = 'open') => {
      setVisible(next);
      if (next) setMode(nextMode);
      onVisibilityChange?.(Boolean(next));
    },
    [onVisibilityChange]
  );

  useEffect(() => {
    clearLegacyInstallDismiss();
    if (!enabled || isPwaInstalled()) {
      setVisible(false);
      onVisibilityChange?.(false);
    }
    return subscribeDeferredInstallPrompt((evt) => {
      setHasNative(Boolean(evt));
    });
  }, [enabled, onVisibilityChange]);

  const tryShowOpen = useCallback(() => {
    if (!enabled || !canOfferInstall() || openDismissedThisVisitRef.current) return;
    setPromptVisible(true, 'open');
  }, [enabled, setPromptVisible]);

  const tryShowExit = useCallback(() => {
    if (!enabled || !canOfferInstall()) return;
    if (wasExitShownThisSession()) return;
    markExitShownThisSession();
    setPromptVisible(true, 'exit');
  }, [enabled, setPromptVisible]);

  useEffect(() => {
    if (!enabled) {
      onVisibilityChange?.(false);
      return undefined;
    }

    const openTimer = window.setTimeout(() => {
      if (!canOfferInstall() || openDismissedThisVisitRef.current) {
        onVisibilityChange?.(false);
        return;
      }
      tryShowOpen();
    }, 1200);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') tryShowExit();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onInstalled = () => setPromptVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.clearTimeout(openTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [enabled, tryShowOpen, tryShowExit, setPromptVisible, onVisibilityChange]);

  useEffect(() => {
    if (!visible) return undefined;
    const t = window.setTimeout(() => {
      installBtnRef.current?.focus({ preventScroll: true });
    }, 120);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [visible]);

  const handleDismiss = () => {
    openDismissedThisVisitRef.current = true;
    setPromptVisible(false);
  };

  const handleInstall = async () => {
    const deferred = getDeferredInstallPrompt();
    if (!deferred) {
      if (isIosDevice()) {
        toast.info('Tap Share → Add to Home Screen to install.');
        return;
      }
      toast.info('Open browser menu (⋮) → Install app / Add to Home screen.');
      return;
    }

    setInstalling(true);
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      clearDeferredInstallPrompt();
      setHasNative(false);
      openDismissedThisVisitRef.current = true;
      setPromptVisible(false);
      if (choice?.outcome === 'accepted') {
        toast.success('App installed — enjoy faster ordering!');
      }
    } catch {
      // ignore
    } finally {
      setInstalling(false);
    }
  };

  if (!enabled || isPwaInstalled()) return null;

  const isIos = isIosDevice() && !hasNative;
  const title =
    mode === 'exit' ? `Leaving? Install ${brandName}` : `Install ${brandName}`;
  const subtitle = isIos
    ? 'Share → Add to Home Screen'
    : 'Faster ordering · home screen · alerts';

  return (
    <AnimatePresence>
      {visible ? (
        <div
          className="fixed inset-0 z-[9200] flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
          role="presentation"
        >
          <motion.button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleDismiss}
          />

          <motion.div
            key="owb-install-modal-wholesale"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owb-install-title-wholesale"
            className="relative z-10 w-full max-w-[min(100%,22rem)]"
            initial={{ opacity: 0, y: -56 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -28 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.85 }}
          >
            <figure
              className="relative overflow-hidden rounded-2xl bg-white p-4 sm:p-5"
              style={{
                boxShadow:
                  '0 0 0 1px rgba(0,0,0,.03), 0 2px 4px rgba(0,0,0,.05), 0 16px 40px rgba(0,0,0,.14)',
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl sm:size-12"
                  style={{ backgroundColor: '#F7A221' }}
                  aria-hidden
                >
                  <svg
                    className="h-5 w-5 text-black sm:h-6 sm:w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <figcaption className="min-w-0 text-[15px] font-semibold leading-snug text-gray-900 sm:text-base">
                      <span className="block sm:inline">{title}</span>
                      <span className="mx-1 hidden text-gray-300 sm:inline">·</span>
                      <span className="mt-0.5 block text-xs font-medium text-gray-500 sm:mt-0 sm:inline">
                        now
                      </span>
                    </figcaption>
                    <button
                      type="button"
                      onClick={handleDismiss}
                      disabled={installing}
                      className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Not now"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p
                    id="owb-install-title-wholesale"
                    className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-sm"
                  >
                    {subtitle}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  ref={installBtnRef}
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  autoFocus
                  className="w-full rounded-xl bg-[#F7A221] px-4 py-2.5 text-sm font-bold text-black outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.98] disabled:opacity-60 sm:flex-1"
                >
                  {installing ? 'Opening…' : isIos ? 'How to install' : 'Install app'}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={installing}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 sm:w-auto sm:px-3"
                >
                  Not now
                </button>
              </div>
            </figure>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default InstallAppPrompt;
