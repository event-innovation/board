// 画面の部品だけを保存して素早く開く。データ（GitHub API）は保存しない。
"use strict";
const CACHE = "mk-admin-v3";
const SHELL = ["./", "index.html", "app.js", "app.css", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // まずネットから取り、つながらないときだけ保存分を使う
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data.json(); } catch (err) { m = { title: "マーケ管理", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "マーケ管理", { body: m.body || "", tag: m.tag, icon: "icon-192.png", data: { url: m.url || "#home" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL("./" + (e.notification.data.url || "#home"), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
