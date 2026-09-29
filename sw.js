// Tempo Agora PWSIS — service worker
// 1) Guarda a interface para abrir rápido e sem internet.
// 2) Em segundo plano (Periodic Background Sync do Chrome/Android), atualiza a notificação
//    do tempo na barra e verifica alertas oficiais do INMET para o último local salvo.
const CACHE = "tempo-agora-v8";
const CFG = "tempo-agora-config";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./badge-96.png", "./icon-maskable-512.png"];

// Guarda cada arquivo separadamente: se um falhar, a instalação do app não é bloqueada
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CFG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
  }
});

/* ---------- configuração enviada pela página ---------- */
async function getCfg() { const c = await caches.open(CFG); const r = await c.match("cfg"); return r ? r.json() : null; }
async function setCfg(v) { const c = await caches.open(CFG); await c.put("cfg", new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } })); }
self.addEventListener("message", e => {
  if (e.data && e.data.type === "config") {
    e.waitUntil((async () => {
      const old = (await getCfg()) || {};
      const seen = [...new Set([...(old.seen || []), ...(e.data.seen || [])])].slice(-300);
      await setCfg({ loc: e.data.loc, prefs: e.data.prefs, seen });
    })());
  }
});

/* ---------- segundo plano ---------- */
self.addEventListener("periodicsync", e => { if (e.tag === "wx-update") e.waitUntil(bgUpdate()); });

const WMO = {0:"Céu limpo",1:"Predomínio de sol",2:"Parcialmente nublado",3:"Nublado",45:"Nevoeiro",48:"Nevoeiro",51:"Garoa fraca",53:"Garoa",55:"Garoa forte",61:"Chuva fraca",63:"Chuva moderada",65:"Chuva forte",80:"Pancadas fracas",81:"Pancadas de chuva",82:"Pancadas fortes",95:"Trovoada",96:"Trovoada com granizo",99:"Tempestade com granizo"};
const PROXIES = [u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`];
async function getJSON(url, proxy) {
  try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json(); }
  catch (e) {
    if (!proxy) throw e;
    for (const p of PROXIES) { try { const r = await fetch(p(url)); if (r.ok) return await r.json(); } catch (_) {} }
    throw e;
  }
}
function inRing(lon, lat, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
function inGeo(lon, lat, g) { if (!g || !g.coordinates) return false; const P = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : []; return P.some(p => inRing(lon, lat, p[0])); }

async function badgeData(t) {
  try {
    const c = new OffscreenCanvas(96, 96), x = c.getContext("2d"), s = t + "°";
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `700 ${s.length > 3 ? 46 : s.length > 2 ? 60 : 72}px sans-serif`; x.fillText(s, 50, 54);
    const buf = await (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
    let bin = ""; new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b));
    return "data:image/png;base64," + btoa(bin);
  } catch (e) { return "badge-96.png"; }
}

async function bgUpdate() {
  const cfg = await getCfg(); if (!cfg || !cfg.loc || !cfg.prefs) return;
  const { lat, lon, name, ibge } = cfg.loc;
  let alertCount = 0;

  if (cfg.prefs.alerts) {
    try {
      const j = await getJSON("https://apiprevmet3.inmet.gov.br/avisos/ativos", true);
      const all = [...(j.hoje || []), ...(j.futuro || [])];
      const seen = new Set(cfg.seen || []);
      for (const a of all) {
        let geo = a.poligono; if (typeof geo === "string") { try { geo = JSON.parse(geo); } catch (e) { geo = null; } }
        const codes = String(a.geocodes || "").split(/[,\s]+/);
        if (!((ibge && codes.includes(ibge)) || inGeo(lon, lat, geo))) continue;
        alertCount++;
        const id = "inmet-" + a.id; if (seen.has(id)) continue; seen.add(id);
        await self.registration.showNotification("⚠ " + (a.descricao || "Aviso meteorológico"), {
          body: `INMET · ${a.severidade || ""} · ${name} · Tempo Agora PWSIS`, icon: "icon-192.png", badge: "badge-96.png",
          tag: id, requireInteraction: true, data: { url: "index.html#agora" }
        });
      }
      cfg.seen = [...seen].slice(-300); await setCfg(cfg);
    } catch (e) {}
  }

  if (cfg.prefs.bar) {
    try {
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
      const t = Math.round(j.current.temperature_2m), d = j.daily;
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: j.timezone });
      await self.registration.showNotification(`${t}° · ${WMO[j.current.weather_code] || ""}`, {
        tag: "wx-now", silent: true, renotify: false, icon: "icon-192.png", badge: await badgeData(t),
        body: `${name} · ↑${Math.round(d.temperature_2m_max[0])}° ↓${Math.round(d.temperature_2m_min[0])}° · chuva ${d.precipitation_probability_max[0]}% · vento ${Math.round(j.current.wind_speed_10m)} km/h${alertCount ? ` · ⚠ ${alertCount} alerta(s)` : ""} · ${hora}`,
        data: { url: "index.html#agora" }
      });
    } catch (e) {}
  }
}

/* toque na notificação abre o app (endereço completo, dentro do escopo do app) */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const scope = self.registration.scope;                     // ex.: https://eliabeanger.github.io/tempo_agora/
  let target = new URL((e.notification.data && e.notification.data.url) || "index.html#agora", scope).href;
  if (!target.startsWith(scope)) target = scope + "index.html#agora";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const mine = list.find(c => c.url.startsWith(scope));
    if (mine) {                                               // app já aberto: traz para frente e mostra a aba Agora
      mine.postMessage({ type: "open", view: "agora" });
      return mine.focus();
    }
    return self.clients.openWindow(target);                   // app fechado: abre com os dados salvos
  })());
});
