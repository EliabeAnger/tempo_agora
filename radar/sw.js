// Radar Brasil — service worker
// App (telas) fica guardado para abrir offline; dados vêm da internet primeiro e,
// se cair a conexão, mostra a última versão guardada.
const VERSAO = "radar-v6";
const APP = ["./", "./index.html", "./manifest.webmanifest", "./dados.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Tudo: tenta a rede primeiro, guarda cópia, e usa a cópia se estiver sem internet
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) {
        const copia = res.clone();
        caches.open(VERSAO).then(c => c.put(req, copia)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(r => r ||
      // só a página do app volta para o index; dados que falharam continuam falhando (o app usa o plano B)
      (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
