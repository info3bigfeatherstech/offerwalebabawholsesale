/**
 * Capture beforeinstallprompt as early as possible (wholesale).
 */
let deferredInstallPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(deferredInstallPrompt);
    } catch {
      // ignore
    }
  });
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredInstallPrompt = null;
  notify();
}

export function subscribeDeferredInstallPrompt(fn) {
  listeners.add(fn);
  fn(deferredInstallPrompt);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notify();
  });
}
