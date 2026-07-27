/*
 * coi-serviceworker.js
 *
 * Makes this page cross-origin isolated (sets Cross-Origin-Embedder-Policy
 * and Cross-Origin-Opener-Policy on every response) WITHOUT needing to
 * configure headers on the host. Required for WebContainers (in-browser
 * npm install + dev server) to boot, since that needs SharedArrayBuffer,
 * which browsers only expose in a cross-origin-isolated context.
 *
 * How it works: on first load it registers itself as a Service Worker,
 * then reloads once. From then on, the Service Worker intercepts every
 * response for this origin and adds the two headers before the browser
 * sees them.
 *
 * Deploy this file in the SAME folder as index.html. It only works over
 * HTTPS (or localhost) — Service Workers require a secure context.
 */
if (typeof window === 'undefined') {
  // ---- Running as the actual Service Worker ----
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', function (event) {
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error('[coi-serviceworker] fetch failed:', e))
    );
  });
} else {
  // ---- Running as a normal page script: register the worker + reload once ----
  (function () {
    if (window.crossOriginIsolated) return; // already isolated, nothing to do
    if (!window.isSecureContext) {
      console.warn('[coi-serviceworker] not a secure context (needs HTTPS) — WebContainers will not work.');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      console.warn('[coi-serviceworker] Service Workers unsupported in this browser.');
      return;
    }

    navigator.serviceWorker.register(window.document.currentScript.src).then(
      function (registration) {
        console.log('[coi-serviceworker] registered.');
        registration.addEventListener('updatefound', () => {
          window.location.reload();
        });
        // If a worker is already active but not yet controlling this page, reload once to pick it up.
        if (registration.active && !navigator.serviceWorker.controller) {
          window.location.reload();
        }
      },
      function (err) {
        console.error('[coi-serviceworker] registration failed:', err);
      }
    );

    // Once a new controller takes over (right after the first registration), reload.
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  })();
}
