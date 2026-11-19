// TravelAI – service worker: mở app nhanh, vẫn mở được khi mạng yếu
const CACHE = "travelai-v4.7";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // AI, ảnh, bản đồ: luôn lấy trực tiếp từ mạng
  if (req.mode === "navigate") {
    // Trang chính: lấy bản mới nhất; mạng chậm quá 1,5 giây thì mở ngay bản đã lưu (bản mới vẫn được lưu cho lần sau)
    const net = fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", cp)); return r; });
    const slow = new Promise((ok) => setTimeout(ok, 1500)).then(() => caches.match("./index.html"));
    e.respondWith(Promise.race([net.catch(() => caches.match("./index.html")), slow.then((hit) => hit || net)]));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
