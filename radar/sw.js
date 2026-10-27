// Radar Brasil — service worker
// App (telas) fica guardado para abrir offline; dados vêm da internet primeiro e,
// se cair a conexão, mostra a última versão guardada.
const VERSAO = "radar-v8";
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

/* ================= NOTIFICAÇÃO DO RESUMO =================
   Com o app instalado (Android/Chrome), o navegador acorda este código de tempos em tempos
   (periodic background sync). Ele lê o dados.json mais novo e, quando o robô publicou
   histórias novas, mostra uma notificação com dólar, bolsa e o assunto principal. */
const META = "radar-meta";
async function lerMeta(k) { const c = await caches.open(META); const r = await c.match(k); return r ? r.json() : null; }
async function gravarMeta(k, v) { const c = await caches.open(META); await c.put(k, new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } })); }
const br = (v, d = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sinal = v => (v >= 0 ? "+" : "") + br(v, 1) + "%";

async function montaResumo() {
  const r = await fetch("./dados.json?" + Date.now(), { cache: "no-store" });
  const d = await r.json();
  let usd = (d.mercado?.moedas || []).find(m => m.sigla === "USD");
  try {  // dólar do momento, se der
    const j = await (await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { cache: "no-store" })).json();
    usd = { valor: +j.USDBRL.bid, var: +j.USDBRL.pctChange };
  } catch (e) {}
  const ib = d.mercado?.ibov, h = (d.historias || [])[0];
  const linha1 = [usd ? `Dólar R$ ${br(usd.valor)} (${sinal(usd.var)})` : "", ib ? `Bolsa ${br(ib.pontos / 1000, 1)} mil (${sinal(ib.var)})` : ""].filter(Boolean).join(" · ");
  const linha2 = d.alerta || (h ? h.titulo : "");
  const hora = new Date(d.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return { chave: d.atualizadoEm, titulo: `Radar Brasil · resumo das ${hora}`, corpo: [linha1, linha2].filter(Boolean).join("\n"), historia: h?.id };
}

async function notifica(forcar) {
  const cfg = (await lerMeta("cfg")) || {};
  if (!forcar && cfg.ativo === false) return;
  if (self.Notification && Notification.permission !== "granted") return;
  const hBR = (new Date().getUTCHours() + 21) % 24;  // hora de Brasília
  if (!forcar && (hBR >= 22 || hBR < 6)) return;     // silêncio à noite
  const s = await montaResumo();
  const ultimo = await lerMeta("ultimo");
  if (!forcar && ultimo === s.chave) return;          // nada novo desde o último aviso
  await self.registration.showNotification(s.titulo, {
    body: s.corpo, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: "radar-resumo", renotify: true, data: { url: "./#entenda" }
  });
  await gravarMeta("ultimo", s.chave);
}

self.addEventListener("periodicsync", e => { if (e.tag === "radar-resumo") e.waitUntil(notifica(false).catch(() => {})); });
self.addEventListener("message", e => {
  const m = e.data || {};
  if (m.tipo === "teste") e.waitUntil(notifica(true));
  if (m.tipo === "cfg") e.waitUntil(gravarMeta("cfg", { ativo: !!m.ativo }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    const c = l.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.navigate(alvo).catch(() => {}); return c.focus(); }
    return clients.openWindow(alvo);
  }));
});
