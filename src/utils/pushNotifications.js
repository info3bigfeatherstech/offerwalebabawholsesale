import axiosInstance from '../SERVICES/Wholesaleaxios';

const PROMPT_DISMISS_SESSION_KEY = 'owb_wholesale_push_prompt_dismissed_session';
const LEGACY_PROMPT_DISMISS_KEY = 'owb_wholesale_push_prompt_dismissed_at';
/** Guest soft-prompt cadence (rolling window). */
const PROMPT_CADENCE_KEY = 'owb_wholesale_push_prompt_cadence';
const SW_READY_TIMEOUT_MS = 12000;

/** Keep in sync with backend pushSoftPrompt.service.js */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SHOWS_IN_WINDOW = 4;
const MIN_GAP_MS = 42 * 60 * 60 * 1000;
const MAX_STORED_IMPRESSIONS = 12;

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

function readGuestCadence() {
  try {
    const raw = localStorage.getItem(PROMPT_CADENCE_KEY);
    if (!raw) return { shownAt: [] };
    const parsed = JSON.parse(raw);
    const shownAt = Array.isArray(parsed?.shownAt)
      ? parsed.shownAt.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    return { shownAt };
  } catch {
    return { shownAt: [] };
  }
}

function writeGuestCadence(shownAt) {
  try {
    const pruned = pruneTimestamps(shownAt);
    localStorage.setItem(
      PROMPT_CADENCE_KEY,
      JSON.stringify({ v: 1, shownAt: pruned })
    );
  } catch {
    // ignore quota / private mode
  }
}

function pruneTimestamps(timestamps, now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  return (Array.isArray(timestamps) ? timestamps : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= cutoff)
    .sort((a, b) => a - b)
    .slice(-MAX_STORED_IMPRESSIONS);
}

function evaluateLocalCadence(shownAt, now = Date.now()) {
  const recent = pruneTimestamps(shownAt, now);
  const count = recent.length;
  const lastMs = count > 0 ? recent[count - 1] : null;

  if (count >= MAX_SHOWS_IN_WINDOW) {
    return { allowed: false, reason: 'max_shows_in_window', count };
  }
  if (lastMs != null && now - lastMs < MIN_GAP_MS) {
    return { allowed: false, reason: 'min_gap', count };
  }
  return { allowed: true, reason: 'ok', count };
}

function permissionAllowsSoftPrompt() {
  if (!isPushSupported()) return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return false;
  return Notification.permission === 'default' || Notification.permission === 'denied';
}

/**
 * Sync guest check (localStorage cadence + this-session dismiss).
 * Prefer evaluatePushPromptEligibility() when login state is known.
 */
export function shouldShowPushPrompt() {
  clearLegacyPromptKeys();
  if (!permissionAllowsSoftPrompt()) return false;
  if (isSessionDismissed()) return false;
  return evaluateLocalCadence(readGuestCadence().shownAt).allowed;
}

/**
 * Logged-in → server cadence (localStorage fallback on API failure).
 * Guest → localStorage only.
 */
export async function evaluatePushPromptEligibility({ isLoggedIn = false } = {}) {
  clearLegacyPromptKeys();
  try {
    if (!permissionAllowsSoftPrompt()) {
      return { allowed: false, reason: 'permission' };
    }
    if (isSessionDismissed()) {
      return { allowed: false, reason: 'session_dismissed' };
    }

    if (!isLoggedIn) {
      const local = evaluateLocalCadence(readGuestCadence().shownAt);
      return { allowed: local.allowed, reason: local.reason, source: 'local' };
    }

    try {
      const res = await axiosInstance.get('/push/prompt-eligibility');
      if (res?.data?.success === true && typeof res.data.allowed === 'boolean') {
        const local = evaluateLocalCadence(readGuestCadence().shownAt);
        // Stricter of server + local: survives LS wipe (server) and failed impression POST (local).
        const allowed = Boolean(res.data.allowed) && local.allowed;
        return {
          allowed,
          reason: !res.data.allowed
            ? res.data.reason || 'server_blocked'
            : !local.allowed
              ? local.reason
              : 'ok',
          source: 'server',
        };
      }
    } catch {
      // fall through to localStorage
    }

    const fallback = evaluateLocalCadence(readGuestCadence().shownAt);
    return {
      allowed: fallback.allowed,
      reason: fallback.reason,
      source: 'local_fallback',
    };
  } catch {
    return { allowed: false, reason: 'error' };
  }
}

/**
 * Record one soft-prompt show. Safe to call multiple times (min-gap / session).
 */
export async function recordPushPromptImpression({ isLoggedIn = false } = {}) {
  const now = Date.now();

  try {
    const { shownAt } = readGuestCadence();
    const cadence = evaluateLocalCadence(shownAt, now);
    if (cadence.allowed) {
      writeGuestCadence([...shownAt, now]);
    }
  } catch {
    // ignore
  }

  if (!isLoggedIn) {
    return { recorded: true, source: 'local' };
  }

  try {
    const res = await axiosInstance.post('/push/prompt-impression');
    return {
      recorded: Boolean(res?.data?.recorded),
      source: 'server',
      reason: res?.data?.reason,
    };
  } catch {
    return { recorded: false, source: 'server_failed' };
  }
}

export function dismissPushPrompt() {
  try {
    sessionStorage.setItem(PROMPT_DISMISS_SESSION_KEY, '1');
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LEGACY_PROMPT_DISMISS_KEY);
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
