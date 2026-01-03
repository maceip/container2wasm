const CACHE_NAME = "mavericks-cache-v1";
const ASSETS = [
  "/mavericks.html",
  "/share-target",
  "/manifest.webmanifest",
  "/worker.js",
  "/dist/runcontainer.js",
  "/dist/worker-util.js",
  "/dist/stack-worker.js",
  "https://cdn.jsdelivr.net/npm/xterm@4.17.0/lib/xterm.min.js",
  "https://cdn.jsdelivr.net/npm/xterm@4.17.0/css/xterm.css",
  "https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/index.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method === "POST" && new URL(request.url).pathname === "/share-target") {
    event.respondWith(handleShareTarget(event));
    return;
  }
  if (request.method !== "GET") return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const files = formData.getAll("files") || [];
    const payload = [];
    for (const f of files) {
      if (typeof f?.arrayBuffer === "function") {
        payload.push({ name: f.name || "shared.bin", data: await f.arrayBuffer() });
      }
    }
    if (payload.length) {
      const bc = new BroadcastChannel("mavericks-share");
      bc.postMessage({ type: "shared-files", files: payload });
      bc.close();
    }
  } catch (e) {
    // ignore errors and continue to redirect
  }
  return Response.redirect("/mavericks.html", 303);
}
