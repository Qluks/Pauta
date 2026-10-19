/* eslint-disable @typescript-eslint/no-explicit-any */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: any;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// Fontes ficam em cache; os dados (Supabase) sempre vêm da rede
registerRoute(({ url }: any) => url.origin === "https://fonts.googleapis.com", new StaleWhileRevalidate({ cacheName: "google-fonts-css" }));
registerRoute(
  ({ url }: any) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-files",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }), new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// Notificação recebida do servidor
self.addEventListener("push", (event: any) => {
  let data: any = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pauta", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pauta", {
      body: data.body,
      tag: data.tag,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { view: data.view || "today" },
    })
  );
});

// Toque na notificação: abre o app (ou volta para ele) na tela Hoje
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const view = event.notification.data?.view || "today";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        await c.focus();
        c.postMessage({ type: "open-view", view });
        return;
      }
      await self.clients.openWindow("/");
    })()
  );
});
