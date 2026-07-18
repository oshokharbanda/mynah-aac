const CACHE_NAME = "mynah-core-v2";
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/symbols/i.png", "/symbols/you.png", "/symbols/want.png", "/symbols/more.png",
  "/symbols/stop.png", "/symbols/go.png", "/symbols/help.png", "/symbols/like.png",
  "/symbols/not.png", "/symbols/my.png", "/symbols/it.png", "/symbols/that.png",
  "/symbols/put.png", "/symbols/make.png", "/symbols/look.png", "/symbols/turn.png",
  "/symbols/big.png", "/symbols/little.png", "/symbols/good.png", "/symbols/bad.png",
  "/symbols/yes.png", "/symbols/no.png", "/symbols/please.png", "/symbols/done.png",
  "/symbols/water.png", "/symbols/eat.png", "/symbols/apple.png", "/symbols/banana.png",
  "/symbols/milk.png", "/symbols/snack.png", "/symbols/mom.png", "/symbols/dad.png",
  "/symbols/teacher.png", "/symbols/friend.png", "/symbols/family.png", "/symbols/baby.png",
  "/symbols/home.png", "/symbols/school.png", "/symbols/park.png", "/symbols/bathroom.png",
  "/symbols/kitchen.png", "/symbols/bed.png", "/symbols/happy.png", "/symbols/sad.png",
  "/symbols/tired.png", "/symbols/angry.png", "/symbols/scared.png", "/symbols/excited.png",
  "/symbols/ball.png", "/symbols/book.png", "/symbols/music.png", "/symbols/toy.png",
  "/symbols/bubbles.png", "/symbols/draw.png", "/symbols/toilet.png", "/symbols/hurt.png",
  "/symbols/thirsty.png", "/symbols/hungry.png", "/symbols/cold.png", "/symbols/hot.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    }),
  );
});
