/* eslint-disable no-restricted-globals */
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

const wbManifest = self.__WB_MANIFEST;
precacheAndRoute(wbManifest);
cleanupOutdatedCaches();

// VitePWA may precache `index.html` (no leading slash). createHandlerBoundToURL
// requires an exact precache match — resolve from the injected manifest safely.
const spaShellUrl = (Array.isArray(wbManifest) ? wbManifest : [])
  .map((entry) => (typeof entry === 'string' ? entry : entry && entry.url))
  .find(
    (url) =>
      typeof url === 'string' &&
      (url === '/index.html' || url === 'index.html' || url.endsWith('/index.html'))
  );

if (spaShellUrl) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(spaShellUrl), {
      denylist: [/^\/api/],
    })
  );
}

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'product-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/products'),
  new NetworkFirst({
    cacheName: 'products-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 5,
      }),
    ],
  })
);

function toAbsoluteAssetUrl(url) {
  if (!url) return `${self.location.origin}/pwa-192x192.png`;
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, self.location.origin).href;
}

function parsePushPayload(event) {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    data = { body: event.data?.text?.() || '' };
  }
  return {
    title: data.title || 'OfferWaaleBaba',
    body: data.body || '',
    icon: toAbsoluteAssetUrl(data.icon || '/pwa-192x192.png'),
    badge: toAbsoluteAssetUrl(data.badge || data.icon || '/pwa-192x192.png'),
    tag: data.tag || 'offerwalebaba',
    actions: Array.isArray(data.actions) ? data.actions : undefined,
    data: data.data || { url: data.url || '/' },
  };
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag || `owb-${Date.now()}`,
    data: payload.data,
    renotify: true,
    requireInteraction: true,
  };
  if (payload.actions?.length) {
    options.actions = payload.actions;
  }
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(payload.title, options);
      } catch (err) {
        await self.registration.showNotification(payload.title || 'OfferWaaleBaba', {
          body: payload.body || 'New update',
          icon: payload.icon,
          badge: payload.badge,
          tag: `owb-fallback-${Date.now()}`,
          data: payload.data,
          requireInteraction: true,
        });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const resolveTargetUrl = () => {
    const raw =
      event.notification?.data?.url ||
      event.notification?.data?.ctaUrl ||
      '/';
    try {
      if (/^https?:\/\//i.test(raw)) return new URL(raw).href;
      return new URL(raw, self.location.origin).href;
    } catch {
      return `${self.location.origin}/`;
    }
  };

  const targetUrl = resolveTargetUrl();

  event.waitUntil(
    (async () => {
      let targetOrigin = self.location.origin;
      try {
        targetOrigin = new URL(targetUrl).origin;
      } catch {
        // keep SW origin
      }

      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        let clientOrigin = '';
        try {
          clientOrigin = new URL(client.url).origin;
        } catch {
          continue;
        }
        if (clientOrigin !== targetOrigin) continue;

        try {
          if (typeof client.navigate === 'function') {
            await client.navigate(targetUrl);
          }
        } catch {
          // navigate can fail for some URL shapes; still try focus
        }
        if (typeof client.focus === 'function') {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })()
  );
});
