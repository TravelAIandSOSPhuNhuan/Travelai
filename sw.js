// TravelAI – service worker: mở app nhanh, bản đồ tải nhanh, thông báo tin nhắn
const CACHE = "travelai-v5.0";
const TILES = "travelai-tiles-v1"; // ô bản đồ + thư viện bản đồ (giữ qua các phiên bản)
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
const MAX_TILES = 900;

self.addEventListener("install", (e) => {
  // tải từng file riêng: thiếu 1 file cũng không làm hỏng cả bộ
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isMapAsset = (u) => /(^|\.)basemaps\.cartocdn\.com$/.test(u.hostname) || (u.hostname === "unpkg.com" && u.pathname.includes("/leaflet@"));
let trimming = false;
async function trimTiles() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(TILES), ks = await c.keys(); for (let i = 0; i < ks.length - MAX_TILES; i++) await c.delete(ks[i]); } catch {}
  trimming = false;
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  // Bản đồ: lấy từ bộ nhớ máy trước (mở lại tức thì), chưa có mới tải từ mạng
  if (isMapAsset(url)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { c.put(req, r.clone()); if (Math.random() < 0.05) trimTiles(); }
      return r;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // AI, Firebase, ảnh: luôn lấy trực tiếp từ mạng
  if (req.mode === "navigate") {
    // Mỗi trang (app / admin) lưu riêng; mạng chậm quá 1,5 giây thì mở ngay bản đã lưu
    const key = url.pathname.endsWith("admin.html") ? "./admin.html" : "./index.html";
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(key, cp)); } return r; });
    const slow = new Promise((ok) => setTimeout(ok, 1500)).then(() => caches.match(key));
    e.respondWith(Promise.race([net.catch(() => caches.match(key)), slow.then((hit) => hit || net)]));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

// Bấm vào thông báo: mở lại đúng trang và đúng khung chat
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  const base = url.split("#")[0], hash = url.split("#")[1] || "";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) {
      if (c.url.split("#")[0] === base && "focus" in c) { c.postMessage({ type: "open", hash }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
