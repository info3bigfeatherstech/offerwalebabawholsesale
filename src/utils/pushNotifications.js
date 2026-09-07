import axiosInstance, { WHOLESALE_USER_ACCESS_TOKEN_KEY } from '../SERVICES/Wholesaleaxios';
import { isPwaInstalled } from './pwaInstallPrompt';

const PROMPT_DISMISS_SESSION_KEY = 'owb_wholesale_push_prompt_dismissed_session';
const LEGACY_PROMPT_DISMISS_KEY = 'owb_wholesale_push_prompt_dismissed_at';
/** Legacy cadence key — cleared so old rate limits do not stick. */
const LEGACY_PROMPT_CADENCE_KEY = 'owb_wholesale_push_prompt_cadence';
const PWA_PENDING_ATTR_KEY = 'owb_wholesale_pwa_pending_attr';
const PWA_ATTR_SYNCED_KEY = 'owb_wholesale_pwa_attr_synced';
const SW_READY_TIMEOUT_MS = 12000;

function waitForServiceWorkerReady(timeoutMs = SW_READY_TIMEOUT_MS) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Service worker is not ready. Refresh the page and try again.')),
        timeoutMs
      );
    }),
  ]);
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidPublicKey() {
  const res = await axiosInstance.get('/push/vapid-public-key');
  if (!res.data?.configured || !res.data?.publicKey) {
    return null;
  }
  return res.data.publicKey;
}

export async function getPushStatus() {
  const res = await axiosInstance.get('/push/status');
  return res.data;
}

function clearLegacyPromptKeys() {
  try {
    localStorage.removeItem(LEGACY_PROMPT_DISMISS_KEY);
    localStorage.removeItem(LEGACY_PROMPT_CADENCE_KEY);
  } catch {
    // ignore
  }
}

function isSessionDismissed() {
  try {
    return sessionStorage.getItem(PROMPT_DISMISS_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function permissionAllowsSoftPrompt() {
  if (!isPushSupported()) return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return false;
  return Notification.permission === 'default' || Notification.permission === 'denied';
}

/**
 * Soft prompt every visit until Allow — only blocked by granted permission
 * or "Not now" in the current browser session.
 */
export function shouldShowPushPrompt() {
  clearLegacyPromptKeys();
  if (!permissionAllowsSoftPrompt()) return false;
  if (isSessionDismissed()) return false;
  return true;
}

export async function evaluatePushPromptEligibility() {
  clearLegacyPromptKeys();
  try {
    if (!permissionAllowsSoftPrompt()) {
      return { allowed: false, reason: 'permission' };
    }
    if (isSessionDismissed()) {
      return { allowed: false, reason: 'session_dismissed' };
    }
    return { allowed: true, reason: 'ok', source: 'visit' };
  } catch {
    return { allowed: false, reason: 'error' };
  }
}

/** Kept for callers; no longer rate-limits soft prompts. */
export async function recordPushPromptImpression() {
  return { recorded: true, source: 'noop' };
}

export function dismissPushPrompt() {
  try {
    sessionStorage.setItem(PROMPT_DISMISS_SESSION_KEY, '1');
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LEGACY_PROMPT_DISMISS_KEY);
    localStorage.removeItem(LEGACY_PROMPT_CADENCE_KEY);
  } catch {
    // ignore
  }
}

export function getNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function subscribeToWebPush() {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device');
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    throw new Error('Push notifications are not configured on the server');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = await waitForServiceWorkerReady(12000);
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  await axiosInstance.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return subscription;
}

export async function syncPushSubscriptionIfGranted() {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return { synced: false, reason: 'not_granted' };
  }

  try {
    const status = await getPushStatus();
    const registration = await waitForServiceWorkerReady(12000);
    const existing = await registration.pushManager.getSubscription();

    if (status?.subscribed && existing) {
      return { synced: true, reason: 'already_subscribed' };
    }

    await subscribeToWebPush();
    return { synced: true, reason: 'subscribed' };
  } catch {
    return { synced: false, reason: 'sync_failed' };
  }
}

export async function unsubscribeFromWebPush() {
  if (!isPushSupported()) return { unsubscribed: false };
  const registration = await waitForServiceWorkerReady(12000);
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { unsubscribed: false };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await axiosInstance.delete('/push/unsubscribe', { data: { endpoint } });
  return { unsubscribed: true };
}

/** Mark that install happened this session (guest or logged-in). */
export function markPwaInstallPendingAttribution() {
  try {
    sessionStorage.setItem(PWA_PENDING_ATTR_KEY, '1');
    sessionStorage.removeItem(PWA_ATTR_SYNCED_KEY);
  } catch {
    // ignore
  }
}

/**
 * POST /push/pwa-install for logged-in users. Never throws.
 * Safe to call from appinstalled / standalone open / after login.
 */
export async function reportPwaInstall() {
  try {
    let token = null;
    try {
      token = localStorage.getItem(WHOLESALE_USER_ACCESS_TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) return false;
    await axiosInstance.post('/push/pwa-install', {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Attribute PWA install when logged in and (standalone OR pending install flag).
 * Session-deduped after a successful report.
 */
export async function syncPwaInstallAttribution({ isLoggedIn } = {}) {
  if (!isLoggedIn) return false;

  let pending = false;
  try {
    pending = sessionStorage.getItem(PWA_PENDING_ATTR_KEY) === '1';
  } catch {
    // ignore
  }

  if (!isPwaInstalled() && !pending) return false;

  try {
    if (sessionStorage.getItem(PWA_ATTR_SYNCED_KEY) === '1') return true;
  } catch {
    // ignore
  }

  const ok = await reportPwaInstall();
  if (ok) {
    try {
      sessionStorage.setItem(PWA_ATTR_SYNCED_KEY, '1');
      sessionStorage.removeItem(PWA_PENDING_ATTR_KEY);
    } catch {
      // ignore
    }
  }
  return ok;
}
