import { useEffect, useRef, useState } from 'react';
import {
  isPushSupported,
  evaluatePushPromptEligibility,
  syncPushSubscriptionIfGranted,
} from '../../utils/pushNotifications';

/**
 * canPrompt = soft UI (permission not granted) — login not required to show.
 * Sync only when syncEnabled (authenticated) + granted.
 *
 * Soft prompt: every visit until Allow (session "Not now" only).
 */
export default function usePushNotifications(syncEnabled = false, isLoggedIn = false) {
  const [supported] = useState(() => isPushSupported());
  const [canPrompt, setCanPrompt] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!supported) {
      setCanPrompt(false);
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      const id = ++requestIdRef.current;
      try {
        const result = await evaluatePushPromptEligibility({ isLoggedIn: Boolean(isLoggedIn) });
        if (cancelled || id !== requestIdRef.current) return;
        setCanPrompt(Boolean(result?.allowed));
      } catch {
        if (cancelled || id !== requestIdRef.current) return;
        setCanPrompt(false);
      }
    };

    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [supported, isLoggedIn]);

  useEffect(() => {
    if (!syncEnabled || !supported) return undefined;
    if (typeof Notification === 'undefined') return undefined;
    if (Notification.permission !== 'granted') return undefined;

    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await syncPushSubscriptionIfGranted();
    })();

    return () => {
      cancelled = true;
    };
  }, [syncEnabled, supported]);

  return {
    supported,
    canPrompt,
  };
}
