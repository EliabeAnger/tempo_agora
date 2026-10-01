"use strict";
/* =============== utilidades =============== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DIAS_L = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const PONTOS = ["N","NNE","NE","ENE","L","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
const dirTxt = d => PONTOS[Math.round(((d%360)+360)%360/22.5)%16];
const ok = v => v!=null && !isNaN(v);
const r0 = v => ok(v) ? Math.round(v) : "--";
const r1 = v => ok(v) ? (Math.round(v*10)/10).toLocaleString("pt-BR") : "--";
const sum = a => a.reduce((x,y)=>x+(y||0),0);
const hhmm = iso => iso ? iso.slice(11,16) : "--:--";
const parseLocal = iso => { const [d,t="00:00"] = iso.split("T"); const [y,m,dd] = d.split("-").map(Number); const [h,mi] = t.split(":").map(Number); return new Date(y,m-1,dd,h||0,mi||0); };
const norm = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDT = d => d.toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});

function setStatus(txt, mode=""){ $("#statusText").textContent = txt; $("#status").className = "status "+mode; }
let toastT; function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,3500); }

/* Busca JSON/texto; se o servidor oficial bloquear o navegador (CORS), tenta por um intermediário público */
const PROXIES = [u=>`https://corsproxy.io/?url=${encodeURIComponent(u)}`, u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, u=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`];
async function getData(url, {type="json", proxy=false, timeout=15000}={}){
  const attempt = async u => {
    const ctl = new AbortController(); const tm = setTimeout(()=>ctl.abort(), timeout);
    try{ const r = await fetch(u,{signal:ctl.signal}); if(!r.ok) throw new Error("HTTP "+r.status); return type==="json" ? await r.json() : await r.text(); }
    finally{ clearTimeout(tm); }
  };
  try{ return await attempt(url); }
  catch(e){
    if(!proxy) throw e;
    for(const p of PROXIES){ try{ const out = await attempt(p(url)); out && typeof out==="object" && (out.__viaProxy = true); return out; }catch(_){} }
    throw e;
  }
}

/* geometria: ponto dentro de polígono (GeoJSON usa [lon,lat]) */
function inRing(lon,lat,ring){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const [xi,yi]=ring[i],[xj,yj]=ring[j]; if(((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside; } return inside; }
function inGeo(lon,lat,g){
  if(!g||!g.coordinates) return false;
  const polys = g.type==="MultiPolygon" ? g.coordinates : g.type==="Polygon" ? [g.coordinates] : [];
  return polys.some(p => inRing(lon,lat,p[0]) && !p.slice(1).some(h=>inRing(lon,lat,h)));
}

/* =============== tempo: códigos e ícones =============== */
const WMO = {0:["Céu limpo","clear"],1:["Predomínio de sol","mostly"],2:["Parcialmente nublado","partly"],3:["Nublado","cloud"],45:["Nevoeiro","fog"],48:["Nevoeiro com geada","fog"],51:["Garoa fraca","drizzle"],53:["Garoa","drizzle"],55:["Garoa forte","drizzle"],56:["Garoa congelante","drizzle"],57:["Garoa congelante forte","drizzle"],61:["Chuva fraca","rain"],63:["Chuva moderada","rain"],65:["Chuva forte","heavy"],66:["Chuva congelante","rain"],67:["Chuva congelante forte","heavy"],71:["Neve fraca","snow"],73:["Neve","snow"],75:["Neve forte","snow"],77:["Grãos de neve","snow"],80:["Pancadas fracas","shower"],81:["Pancadas de chuva","shower"],82:["Pancadas fortes","heavy"],85:["Pancadas de neve","snow"],86:["Neve forte","snow"],95:["Trovoada","storm"],96:["Trovoada com granizo","storm"],99:["Tempestade com granizo","storm"]};
const wmo = c => WMO[c] || ["—","cloud"];
/* Ícones do tempo: um desenho para cada situação (sol, lua, nuvens, garoa, chuva, sol com chuva,
   raio, sol com raio, granizo, neve, neblina, geada, vento forte) */
function icon(code, isDay=1, opt={}){
  const C = {sun:"#ffd166", moon:"#e3eaf7", cl:"#d6e0f0", cl2:"#aebbd3", dk:"#7a88a6", st:"#5f5596", drop:"#5cc4ff", dropH:"#2f97ff", ice:"#bfe8ff", bolt:"#ffcc33"};
  if(document.documentElement.dataset.theme==="light" && !opt.forDark) Object.assign(C, {moon:"#aab8d0", cl:"#b9c7dd", cl2:"#94a6c3", dk:"#6d7c9b", sun:"#f5b700", bolt:"#f5b700", drop:"#2d9be6", ice:"#8fcdf0"});
  const rays = [0,45,90,135,180,225,270,315].map(a=>{const r=a*Math.PI/180;return `<line x1="${(24+13*Math.cos(r)).toFixed(1)}" y1="${(24+13*Math.sin(r)).toFixed(1)}" x2="${(24+17.5*Math.cos(r)).toFixed(1)}" y2="${(24+17.5*Math.sin(r)).toFixed(1)}"/>`}).join("");
  const sun = (tx=0,ty=0,s=1) => `<g transform="translate(${tx},${ty}) scale(${s})"><circle cx="24" cy="24" r="8.5" fill="${C.sun}"/><g stroke="${C.sun}" stroke-width="3" stroke-linecap="round">${rays}</g></g>`;
  const moon = (tx=0,ty=0,s=1) => `<g transform="translate(${tx},${ty}) scale(${s})"><path d="M29 9a14 14 0 1 0 11 21A11.5 11.5 0 0 1 29 9z" fill="${C.moon}"/></g>`;
  const stars = `<g fill="${C.moon}"><circle cx="38" cy="10" r="1.3"/><circle cx="42" cy="18" r="1"/><circle cx="33" cy="5" r=".9"/></g>`;
  const cloud = (f=C.cl,tx=0,ty=0,s=1) => `<path transform="translate(${tx},${ty}) scale(${s})" d="M14 38h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z" fill="${f}"/>`;
  const behind = isDay ? sun(-7,-8,.78) : moon(-5,-6,.72);
  const drops = (n,c=C.drop,long=false) => `<g stroke="${c}" stroke-width="${long?3:2.6}" stroke-linecap="round">${Array.from({length:n},(_,i)=>{const x=(n===2?20:n===3?17:15)+i*(n===2?9:7);return `<line x1="${x}" y1="37" x2="${x-2}" y2="${long?46:43}"/>`}).join("")}</g>`;
  const dots = (n,c=C.drop) => `<g fill="${c}">${Array.from({length:n},(_,i)=>`<circle cx="${16+i*6}" cy="${39+(i%2)*4}" r="1.6"/>`).join("")}</g>`;
  const flake = (x,y,r=3.2,c="#fff") => `<g stroke="${c}" stroke-width="1.6" stroke-linecap="round"><line x1="${x-r}" y1="${y}" x2="${x+r}" y2="${y}"/><line x1="${x-r/2}" y1="${y-r*.87}" x2="${x+r/2}" y2="${y+r*.87}"/><line x1="${x-r/2}" y1="${y+r*.87}" x2="${x+r/2}" y2="${y-r*.87}"/></g>`;
  const flakes = n => Array.from({length:n},(_,i)=>flake(15+i*(n>3?6.5:9),39+(i%2)*4)).join("");
  const hail = n => `<g fill="${C.ice}" stroke="#fff" stroke-width=".6">${Array.from({length:n},(_,i)=>`<circle cx="${16+i*6}" cy="${40+(i%2)*4}" r="2.1"/>`).join("")}</g>`;
  const bolt = (tx=0,ty=0,s=1) => `<path transform="translate(${tx},${ty}) scale(${s})" d="M26 26l-7 10h5.5l-3 9.5 10-12.5h-5.5l3.5-7z" fill="${C.bolt}" stroke="#b77d00" stroke-width=".6" stroke-linejoin="round"/>`;
  const fog = `<g stroke="${C.cl2}" stroke-width="3" stroke-linecap="round"><line x1="8" y1="37" x2="40" y2="37"/><line x1="12" y1="42.5" x2="36" y2="42.5"/><line x1="16" y1="47" x2="30" y2="47"/></g>`;
  const wind = `<g fill="none" stroke="#9fb3d3" stroke-width="2.2" stroke-linecap="round"><path d="M3 14h12a3.5 3.5 0 1 0-3.5-3.5"/><path d="M1 20h17"/></g>`;
  let b;
  switch(code){
    case 0:  b = isDay ? sun() : moon(-2,0)+stars; break;
    case 1:  b = (isDay ? sun(-2,-3,.95) : moon(-3,-3,.9)+stars) + cloud(C.cl,14,18,.62); break;
    case 2:  b = behind + cloud(); break;
    case 3:  b = cloud(C.dk,-1,-9,.8) + cloud(C.cl2,2,1,.95); break;
    case 45: b = cloud(C.cl2,0,-8) + fog; break;
    case 48: b = cloud(C.cl2,0,-8) + fog + flake(40,10,4,C.ice); break;
    case 51: b = cloud(C.cl,0,-5) + dots(3,"#8fd6ff"); break;
    case 53: b = cloud(C.cl2,0,-5) + dots(4,"#8fd6ff"); break;
    case 55: b = cloud(C.cl2,0,-5) + dots(5); break;
    case 56: case 57: b = cloud(C.cl2,0,-5) + dots(3,"#8fd6ff") + flake(36,42,3,C.ice); break;
    case 61: b = cloud(C.cl2,0,-5) + drops(2); break;
    case 63: b = cloud(C.cl2,0,-5) + drops(3); break;
    case 65: b = cloud(C.dk,0,-5) + drops(4,C.dropH,true); break;
    case 66: case 67: b = cloud(C.cl2,0,-5) + drops(2) + flake(36,42,3,C.ice); break;
    case 71: b = cloud(C.cl,0,-5) + flakes(2); break;
    case 73: b = cloud(C.cl,0,-5) + flakes(3); break;
    case 75: b = cloud(C.cl2,0,-5) + flakes(4); break;
    case 77: b = cloud(C.cl,0,-5) + dots(4,"#ffffff"); break;
    case 80: b = behind + cloud(C.cl,2,-3) + drops(2); break;               // sol/lua com chuva
    case 81: b = behind + cloud(C.cl2,2,-3) + drops(3); break;
    case 82: b = behind + cloud(C.dk,2,-3) + drops(4,C.dropH,true); break;
    case 85: case 86: b = behind + cloud(C.cl,2,-3) + flakes(code===86?4:2); break;
    case 95: b = (isDay && opt.cloud!=null && opt.cloud<60)                  // sol com raio (trovoada isolada)
               ? sun(-7,-8,.78) + cloud(C.cl2,0,-5) + bolt(0,-2,1) + drops(2)
               : cloud(C.st,0,-5) + bolt(0,-2,1) + drops(2); break;         // raio com chuva
    case 96: b = cloud(C.st,0,-5) + bolt(-4,-2,1) + hail(3); break;          // raio com granizo
    case 99: b = cloud("#4c4480",0,-5) + bolt(-4,-2,1) + hail(4); break;     // tempestade forte com granizo
    default: b = cloud();
  }
  if(opt.gust >= 50) b = wind + b;                                           // vento forte
  const label = wmo(code)[0] + (opt.gust>=50 ? ", com vento forte" : "");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ic" viewBox="0 0 48 48" role="img" aria-label="${label}">${b}</svg>`;
}
const arrowSvg = deg => `<svg viewBox="0 0 12 12" style="transform:rotate(${deg+180}deg)"><path d="M6 1l3.5 9L6 8 2.5 10z" fill="currentColor"/></svg>`;
const BFT = [[1,"Calmaria"],[6,"Aragem"],[12,"Brisa leve"],[20,"Brisa fraca"],[29,"Brisa moderada"],[39,"Brisa forte"],[50,"Vento fresco"],[62,"Vento forte"],[75,"Ventania"],[89,"Ventania forte"],[103,"Tempestade"],[118,"Tempestade violenta"]];
const beaufort = k => { for(let i=0;i<BFT.length;i++) if(k<BFT[i][0]) return [i,BFT[i][1]]; return [12,"Furacão"]; };

/* =============== estado =============== */
const state = { loc:null, data:null, models:null, air:null, official:[], officialStatus:{}, chartKey:"temp", chart:null, chartM:null, map:null, marker:null, radar:null, alertLayer:null, view:"agora", lastLoad:0 };

/* =============== navegação =============== */
function showView(v){
  state.view = v;
  $$(".view").forEach(s => s.hidden = s.dataset.view !== v);
  $$(".nav button").forEach(b => { if(b.dataset.view===v) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  try{ history.replaceState(null,"","#"+v); }catch(e){}
  window.scrollTo({top:0,behavior:"instant"});
  if(v==="graficos"){ renderChart(); renderModels(); }
  if(v==="local"){ ensureMap(); setTimeout(()=>state.map && state.map.invalidateSize(),60); }
  if(v==="noticias") loadNews();
  $("#fabAsk").hidden = v==="agora";
}
$$(".nav button").forEach(b => b.addEventListener("click", ()=>showView(b.dataset.view)));
window.addEventListener("scroll", ()=>$("#top").classList.toggle("scrolled", scrollY>4), {passive:true});

/* =============== localização (GPS + busca) =============== */
/* distância em km entre dois pontos */
function distKm(a,b){ const R=6371, t=x=>x*Math.PI/180, dLa=t(b.lat-a.lat), dLo=t(b.lon-a.lon);
  const h=Math.sin(dLa/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
const FRESH_MS = 15*60*1000;
const isFresh = () => state.data && Date.now()-state.lastLoad < FRESH_MS;

function getGps(force=false){
  if(!("geolocation" in navigator)){ setStatus("Este navegador não tem GPS. Busque sua cidade.", "err"); return; }
  if(!state.data) setStatus("Pedindo a localização ao GPS do celular…","load");
  $("#btnGps").classList.add("busy");
  navigator.geolocation.getCurrentPosition(async p=>{
    $("#btnGps").classList.remove("busy"); $("#btnGps").classList.add("on");
    const {latitude:lat, longitude:lon, accuracy} = p.coords;
    const prev = state.loc, near = prev && prev.gps && distKm(prev,{lat,lon}) < 1;
    const loc = {lat, lon, gps:true, acc:Math.round(accuracy)};
    if(near) ["name","district","state","uf","country","cc","ibge","micro"].forEach(k=>{ if(prev[k]) loc[k]=prev[k]; });
    // mesmo lugar e dados recentes: só atualiza o GPS, sem baixar tudo de novo
    if(near && !force && isFresh()){ state.loc = {...loc, lat:prev.lat, lon:prev.lon}; store.set("wx_loc", state.loc); renderPlace(); tickStatus(); return; }
    setLocation(loc, near);
  }, err=>{
    $("#btnGps").classList.remove("busy");
    const msg = {1:"Você não permitiu a localização.",2:"Sem sinal de GPS agora.",3:"O GPS demorou para responder."}[err.code] || "Falha no GPS.";
    const hint = location.protocol==="file:" ? " Abra o app por um link https (veja a aba Local) ou busque a cidade." : " Toque no alvo para tentar de novo ou busque a cidade.";
    if(!state.data) setStatus(msg+hint, "err"); else toast(msg);
    if(!state.loc) setLocation({lat:-28.2926, lon:-53.5017, name:"Panambi", uf:"RS", state:"Rio Grande do Sul", country:"Brasil", fallback:true});
  }, {enableHighAccuracy:true, timeout:20000, maximumAge:120000});
}

/* completa nome, estado e código IBGE do local */
const UF = {"acre":"AC","alagoas":"AL","amapa":"AP","amazonas":"AM","bahia":"BA","ceara":"CE","distrito federal":"DF","espirito santo":"ES","goias":"GO","maranhao":"MA","mato grosso":"MT","mato grosso do sul":"MS","minas gerais":"MG","para":"PA","paraiba":"PB","parana":"PR","pernambuco":"PE","piaui":"PI","rio de janeiro":"RJ","rio grande do norte":"RN","rio grande do sul":"RS","rondonia":"RO","roraima":"RR","santa catarina":"SC","sao paulo":"SP","sergipe":"SE","tocantins":"TO"};
async function enrichLocation(loc){
  if(!loc.gps){                      // cidade buscada ou favorito: não envia coordenadas a terceiros
    loc.name = loc.name || "Local escolhido"; loc.uf = loc.uf || UF[norm(loc.state)] || "";
    if((loc.cc==="BR" || loc.uf) && loc.uf && !loc.ibge){
      try{ const list = await getData(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${loc.uf}/municipios`);
        const m = list.find(x => norm(x.nome)===norm(loc.name)); if(m){ loc.ibge = String(m.id); loc.micro = m.microrregiao && m.microrregiao.nome; } }catch(e){}
    }
    return loc;
  }
  try{
    const j = await getData(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${rc(loc.lat)}&longitude=${rc(loc.lon)}&localityLanguage=pt`);
    loc.name = loc.name || j.city || j.locality || "Sua localização";
    loc.district = j.locality && j.locality!==j.city ? j.locality : "";
    loc.state = loc.state || j.principalSubdivision || "";
    loc.uf = loc.uf || (j.principalSubdivisionCode||"").replace(/^BR-/,"");
    loc.country = loc.country || j.countryName || "";
    loc.cc = j.countryCode || loc.cc || "";
  }catch(e){ loc.name = loc.name || "Sua localização"; }
  if((loc.cc==="BR" || loc.country==="Brasil") && loc.uf && !loc.ibge){
    try{
      const list = await getData(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${loc.uf}/municipios`);
      const m = list.find(x => norm(x.nome)===norm(loc.name));
      if(m){ loc.ibge = String(m.id); loc.micro = m.microrregiao && m.microrregiao.nome; }
    }catch(e){}
  }
  return loc;
}

async function setLocation(loc, silent=false){
  state.loc = loc; renderPlace();
  const known = loc.name && loc.state && (loc.ibge || (loc.cc && loc.cc!=="BR"));
  if(!known){ if(!silent && !state.data) setStatus("Identificando o local…","load"); await enrichLocation(loc); }
  store.set("wx_loc", loc);
  syncWorker();
  renderPlace();
  loadAll();
}
function renderPlace(){
  const l = state.loc; if(!l) return;
  $("#placeName").textContent = l.name || "Sua localização";
  const chip = $("#placeChip"); chip.hidden = false;
  if(l.gps){ chip.className="chip gps"; chip.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>GPS ±${l.acc!=null?l.acc:"?"} m`; }
  else if(l.fallback){ chip.className="chip"; chip.textContent="Local padrão"; }
  else { chip.className="chip"; chip.textContent="Cidade buscada"; }
  $("#placeSub").textContent = [l.district, l.uf ? `${l.state} (${l.uf})` : l.state, l.country].filter(Boolean).join(" · ");
}

let searchT;
$("#q").addEventListener("input", e=>{ clearTimeout(searchT); const q=e.target.value.trim(); if(q.length<2){ $("#results").hidden=true; return; } searchT=setTimeout(()=>searchCity(q),300); });
$("#q").addEventListener("keydown", e=>{ if(e.key==="Escape"){ $("#results").hidden=true; e.target.blur(); } if(e.key==="Enter"){ const b=$("#results button"); b && b.click(); } });
document.addEventListener("click", e=>{ if(!e.target.closest(".search")) $("#results").hidden=true; });
async function searchCity(q){
  const box = $("#results");
  try{
    const j = await getData(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`);
    box.innerHTML = "";
    if(!j.results || !j.results.length){ box.innerHTML = `<button disabled>Nenhuma cidade encontrada</button>`; box.hidden=false; return; }
    j.results.forEach(c=>{
      const b = document.createElement("button");
      b.innerHTML = `${esc(c.name)}<br><small>${esc([c.admin1,c.country].filter(Boolean).join(", "))}</small>`;
      b.onclick = ()=>{ box.hidden=true; $("#q").value=""; $("#q").blur(); $("#btnGps").classList.remove("on");
        setLocation({lat:c.latitude, lon:c.longitude, name:c.name, state:c.admin1||"", country:c.country||"", cc:c.country_code||""}); };
      box.appendChild(b);
    });
    box.hidden = false;
  }catch(e){ toast("Sem conexão para buscar cidades."); }
}

/* =============== memória local: guarda tudo para abrir na hora =============== */
function saveBundle(){
  if(!state.data || !state.loc) return;
  const b = {t:state.lastLoad, loc:state.loc, data:state.data, models:state.models, air:state.air,
    official:state.official, officialStatus:state.officialStatus, aboutHTML:state.aboutHTML, wikiSrc:state.wikiSrc};
  try{ localStorage.setItem("wx_cache", JSON.stringify(b)); }
  catch(e){ try{ delete b.models; localStorage.setItem("wx_cache", JSON.stringify(b)); }catch(_){} }
}
function restoreBundle(){
  const b = store.get("wx_cache"); if(!b || !b.data || !b.loc || !state.loc || distKm(b.loc,state.loc)>1) return false;
  state.data = b.data; state.lastLoad = b.t; state.models = b.models||null; state.air = b.air||null;
  state.official = (b.official||[]).map(a=>({...a, start:a.start?new Date(a.start):null, end:a.end?new Date(a.end):null})).filter(a=>!a.end || a.end>new Date());
  state.officialStatus = b.officialStatus||{}; state.aboutHTML = b.aboutHTML; state.wikiSrc = b.wikiSrc;
  renderWeather(); renderAir(); renderLinks();
  if(state.aboutHTML){ $("#about").innerHTML = state.aboutHTML; $("#wikiSrc").textContent = state.wikiSrc||""; }
  $("#navBadge").hidden = !state.official.length; $("#navBadge").textContent = state.official.length;
  tickStatus(); return true;
}
function refreshIfStale(force=false){
  if(!state.loc) return;
  if(state.loc.gps) getGps(force);
  else if(force || !isFresh()) loadAll();
}

/* =============== carregamento =============== */
/* nada sai do celular com precisão maior que ~1 km */
const rc = x => Math.round(x*100)/100;
async function loadAll(){
  if(!state.loc) return;
  $("#btnRefresh").classList.add("busy");
  if(!state.data) setStatus("Baixando a previsão…","load");
  const lat = rc(state.loc.lat), lon = rc(state.loc.lon);
  const H="temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,cape,is_day,soil_temperature_0cm,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,et0_fao_evapotranspiration,vapour_pressure_deficit";
  const D="weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration,shortwave_radiation_sum";
  const C="temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
  try{
    state.data = await getData(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${C}&hourly=${H}&daily=${D}&minutely_15=precipitation&forecast_minutely_15=12&timezone=auto&forecast_days=14&wind_speed_unit=kmh`);
    state.lastLoad = Date.now();
    renderWeather();
    saveBundle();
    tickStatus();
  }catch(e){
    if(!state.data) restoreBundle();
    setStatus(state.data ? "Sem internet agora. Mostrando os últimos dados salvos." : "Sem conexão com o serviço de previsão.", "err");
  }finally{ $("#btnRefresh").classList.remove("busy"); }
  // em paralelo, sem travar a tela
  Promise.allSettled([loadOfficial(), loadModels(), loadAir(), loadAbout()]).then(saveBundle);
  renderLinks();
  if(state.map) updateMap();
}
function tickStatus(){
  if(!state.lastLoad) return;
  const min = Math.round((Date.now()-state.lastLoad)/60000);
  const via = state.data && state.data.elevation!=null ? ` · altitude ${r0(state.data.elevation)} m` : "";
  if(!$("#status").classList.contains("err")) setStatus(`Atualizado ${min<1?"agora":`há ${min} min`}${via}`);
}
setInterval(tickStatus, 30000);

/* =============== ALERTAS OFICIAIS =============== */
const SEV_INMET = s => { const n = norm(s); return n.includes("grande") ? "danger" : n==="perigo" ? "orange" : "warn"; };
const SEV_CAP = s => ({extreme:"danger",severe:"orange",moderate:"warn",minor:"warn"}[norm(s)] || "warn");
const SEV_CAP_TXT = s => ({extreme:"Grande perigo",severe:"Perigo",moderate:"Perigo potencial",minor:"Atenção",unknown:"Alerta"}[norm(s)] || s || "Alerta");
const SEV_COLOR = {warn:"var(--warn)",orange:"var(--orange)",danger:"var(--danger)",storm:"var(--storm)",info:"var(--accent)",ok:"var(--ok)"};
const SEV_RANK = {info:1,warn:2,storm:3,orange:3,danger:4};

async function loadOfficial(){
  const {lat,lon,ibge,uf,state:estado} = state.loc;
  const out = [], st = {};
  // 1) INMET — avisos meteorológicos (JSON com polígono)
  try{
    const j = await getData("https://apiprevmet3.inmet.gov.br/avisos/ativos", {proxy:true});
    st.inmet = j.__viaProxy ? "proxy" : "ok";
    const all = [...(j.hoje||[]), ...(j.futuro||[])];
    const seen = new Set();
    state.inmetAll = [];
    all.forEach(a=>{
      if(seen.has(a.id)) return; seen.add(a.id);
      let geo = a.poligono; if(typeof geo==="string"){ try{ geo = JSON.parse(geo); }catch(e){ geo=null; } }
      const geocodes = String(a.geocodes||"").split(/[,\s]+/).filter(Boolean);
      const inArea = (ibge && geocodes.includes(ibge)) || inGeo(lon,lat,geo);
      const start = inmetDate(a.data_inicio, a.hora_inicio), end = inmetDate(a.data_fim, a.hora_fim);
      if(end && end < new Date()) return;
      const item = {
        src:"INMET", id:"inmet-"+a.id, sev:SEV_INMET(a.severidade), sevTxt:a.severidade||"Aviso",
        title:a.descricao || a.evento || "Aviso meteorológico", start, end, geo,
        risks:listify(a.riscos), instr:listify(a.instrucoes), areas:a.estados||"", link:"https://alertas2.inmet.gov.br/"+(a.id_aviso||"")
      };
      state.inmetAll.push(item);
      if(inArea) out.push(item);
    });
    st.inmetState = state.inmetAll.filter(a => estado && a.areas.includes(estado)).length;
  }catch(e){ st.inmet = "fail"; }

  // 2) Defesa Civil — IDAP (feed CAP)
  try{
    const xml = await getData("https://idapfile.mdr.gov.br/idap/api/rss/cap", {type:"text", proxy:true, timeout:20000});
    st.idap = "ok";
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const T = (el,n) => { const x = el.getElementsByTagNameNS("*",n)[0]; return x ? x.textContent.trim() : ""; };
    [...doc.getElementsByTagNameNS("*","info")].forEach((info,idx)=>{
      const alertEl = info.parentNode;
      const expires = T(info,"expires") ? new Date(T(info,"expires")) : null;
      if(expires && expires < new Date()) return;
      if(norm(T(alertEl,"msgType"))==="cancel") return;
      let hit = false;
      [...info.getElementsByTagNameNS("*","area")].forEach(area=>{
        [...area.getElementsByTagNameNS("*","polygon")].forEach(p=>{
          const ring = p.textContent.trim().split(/\s+/).map(pt=>{ const [la,lo]=pt.split(",").map(Number); return [lo,la]; });
          if(ring.length>2 && inRing(lon,lat,ring)) hit = true;
        });
        [...area.getElementsByTagNameNS("*","geocode")].forEach(g=>{ if(ibge && T(g,"value").split(/[,\s]+/).includes(ibge)) hit = true; });
        // último recurso: nome do município escrito na descrição da área
        if(!hit && state.loc.name){
          const desc = norm(T(area,"areaDesc")), nm = norm(state.loc.name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
          if(new RegExp(`(^|[^a-z])${nm}([^a-z]|$)`).test(desc)) hit = true;
        }
      });
      if(!hit) return;
      out.push({
        src:"Defesa Civil", id:"idap-"+(T(alertEl,"identifier")||idx), sev:SEV_CAP(T(info,"severity")), sevTxt:SEV_CAP_TXT(T(info,"severity")),
        title:T(info,"headline") || T(info,"event") || "Alerta da Defesa Civil", start:T(info,"onset")?new Date(T(info,"onset")):null, end:expires,
        risks:listify(T(info,"description")), instr:listify(T(info,"instruction")), areas:T(info,"senderName"), link:T(info,"web")
      });
    });
  }catch(e){ st.idap = "fail"; }

  state.official = out.sort((a,b)=>(SEV_RANK[b.sev]||0)-(SEV_RANK[a.sev]||0));
  state.officialStatus = st;
  renderAlerts();
  drawAlertAreas();
  notifyNew(out);
  if(state.data){ renderPreview(); updateBarNotification(); }
}
function inmetDate(d,h){ if(!d) return null; const day = String(d).slice(0,10); const [y,m,dd]=day.split("-").map(Number); const [hh,mi]=(h||"00:00").split(":").map(Number);
  return new Date(Date.UTC(y,m-1,dd,(hh||0)+3,mi||0)); } // horário de Brasília (UTC-3)
function listify(v){ if(!v) return []; if(Array.isArray(v)) return v.map(x=>typeof x==="string"?x:(x.descricao||x.texto||JSON.stringify(x))).filter(Boolean);
  return String(v).split(/\r?\n|;|•/).map(s=>s.replace(/^[-–\s]+/,"").trim()).filter(s=>s.length>2); }

/* alertas calculados pela previsão (48 h) */
function calcAlerts(){
  const d = state.data; if(!d) return [];
  const h = d.hourly, i0 = nowIndex(), end = Math.min(h.time.length,i0+48), f = {};
  const add = (key,sev,title,t,val,text,unit="") => { const a=f[key]; if(!a) f[key]={src:"Previsão",sev,title,first:t,peak:val,peakT:t,text,unit};
    else { if(val>a.peak){a.peak=val;a.peakT=t;} if((SEV_RANK[sev]||0)>(SEV_RANK[a.sev]||0)){a.sev=sev;a.title=title;a.text=text;} } };
  for(let i=i0;i<end;i++){
    const t=h.time[i], wc=h.weather_code[i], g=h.wind_gusts_10m[i], pr=h.precipitation[i], cape=h.cape[i], pp=h.precipitation_probability[i];
    if(wc===96||wc===99) add("storm","danger","Tempestade com granizo",t,wc,"Risco de granizo, raios e rajadas. Evite áreas abertas e proteja veículos.");
    else if(wc===95) add("storm","storm","Trovoadas previstas",t,wc,"Raios e chuva forte localizada. Tire aparelhos sensíveis da tomada.");
    if(cape>=2500&&pp>=30) add("cape","danger","Atmosfera muito instável",t,cape,"Energia para temporais severos (CAPE alto).", " J/kg");
    else if(cape>=1000&&pp>=40) add("cape","storm","Instabilidade para trovoadas",t,cape,"Podem se formar tempestades isoladas.", " J/kg");
    if(g>=80) add("gust","danger","Rajadas muito fortes",t,g,"Risco de queda de árvores, destelhamento e falta de luz."," km/h");
    else if(g>=55) add("gust","orange","Rajadas fortes",t,g,"Prenda objetos soltos e estruturas leves (tendas, som externo)."," km/h");
    if(pr>=20) add("rain","danger","Chuva muito forte",t,pr,"Risco de alagamentos e enxurradas."," mm/h");
    else if(pr>=8) add("rain","orange","Chuva forte",t,pr,"Muita chuva em pouco tempo; alagamentos pontuais."," mm/h");
    if(h.visibility[i]<1000) add("fog","info","Nevoeiro",t,0,"Visibilidade abaixo de 1 km. Faróis baixos na estrada.");
    if(h.uv_index[i]>=8) add("uv","warn","UV muito alto",t,h.uv_index[i],"Protetor solar e sombra entre 10h e 16h.");
    if(h.temperature_2m[i]>=35) add("heat","orange","Calor intenso",t,h.temperature_2m[i],"Beba água e evite esforço nas horas quentes.","°C");
    if(h.temperature_2m[i]<=3) add("cold","info","Frio intenso / geada",t,-h.temperature_2m[i],"Proteja plantas, animais e agasalhe-se.");
  }
  return Object.entries(f).map(([k,a])=>{ let extra="";
    if(k==="cold") extra=` · mínima ${r0(-a.peak)}°C`; else if(a.unit) extra=` · pico ${r0(a.peak)}${a.unit} ${whenTxt(a.peakT)}`; else if(k==="uv") extra=` · pico ${r1(a.peak)}`;
    return {...a, id:"calc-"+k, desc:`A partir de ${whenTxt(a.first)}${extra}. ${a.text}`}; });
}

function renderAlerts(){
  const off = state.official || [], calc = calcAlerts().sort((a,b)=>(SEV_RANK[b.sev]||0)-(SEV_RANK[a.sev]||0));
  const card = (a,open) => {
    const period = [a.start && `de ${fmtDT(a.start)}`, a.end && `até ${fmtDT(a.end)}`].filter(Boolean).join(" ");
    const body = a.src==="Previsão" ? "" : `<div class="body">
        ${a.risks.length?`<div><h4>Riscos</h4><ul>${a.risks.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
        ${a.instr.length?`<div><h4>O que fazer</h4><ul>${a.instr.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
        ${a.link?`<a href="${esc(a.link)}" target="_blank" rel="noopener">Ver aviso completo na fonte oficial ↗</a>`:""}
      </div>`;
    return `<details class="alert" style="--c:${SEV_COLOR[a.sev]}" ${open?"open":""}>
      <summary><span class="sev"></span><h3>${esc(a.title)}</h3><span class="src ${a.src==="Previsão"?"calc":""}">${esc(a.src)}</span>
      <span class="meta">${a.src==="Previsão" ? esc(a.desc) : esc([a.sevTxt, period].filter(Boolean).join(" · "))}</span></summary>${body}</details>`;
  };
  let html = off.map((a,i)=>card(a,i===0)).join("");
  if(!off.length) html += `<div class="alert ok"><summary style="cursor:default"><span class="sev"></span><h3>Nenhum alerta oficial para ${esc(state.loc.name||"este local")}</h3><span class="src" style="background:var(--ok)">Oficial</span><span class="meta">Consultado no INMET e na Defesa Civil agora.</span></summary></div>`;
  const calcTop = calc.slice(0,2), calcRest = calc.slice(2);
  html += calcTop.map(a=>card(a,false)).join("");
  if(calcRest.length) html += `<details class="more-alerts"><summary>+ ${calcRest.length} aviso(s) da previsão</summary><div class="alerts">${calcRest.map(a=>card(a,false)).join("")}</div></details>`;
  $("#alerts").innerHTML = html;
  const st = state.officialStatus, notes = [];
  if(st.inmet==="fail") notes.push("Não consegui consultar o INMET agora.");
  if(st.idap==="fail") notes.push("Não consegui consultar a Defesa Civil (IDAP) agora.");
  if(st.inmetState) notes.push(`${st.inmetState} aviso(s) do INMET ativos em ${state.loc.state}, veja no mapa da aba Local.`);
  $("#alertsNote").textContent = notes.join(" ");
  const badge = $("#navBadge"); badge.hidden = !off.length; badge.textContent = off.length;
}

/* =============== notificações, barra de status e instalação =============== */
const prefs = Object.assign({bar:false, alerts:false}, store.get("wx_prefs")||{});
const hasSW = "serviceWorker" in navigator && location.protocol.startsWith("http");
const hasNotif = "Notification" in window;
let installEvt = null;

/* desenha o número da temperatura para o ícone pequeno da barra (Android usa só a silhueta branca) */
function tempBadge(t){
  try{
    const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d");
    const s = String(t)+"°"; x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `700 ${s.length>3?46:s.length>2?60:72}px "Barlow Condensed","Arial Narrow",sans-serif`;
    x.fillText(s, 50, 54); return c.toDataURL("image/png");
  }catch(e){ return "badge-96.png"; }
}
async function swReg(){ if(!hasSW) return null; try{ return await navigator.serviceWorker.ready; }catch(e){ return null; } }
/* conteúdo da notificação: chance de chuva de AGORA e das próximas horas, não a máxima do dia */
function barContent(){
  const d = state.data, c = d.current, dd = d.daily, h = d.hourly, i0 = nowIndex(), t = r0(c.temperature_2m);
  const pNext = h.precipitation_probability[i0+1] ?? h.precipitation_probability[i0] ?? 0;
  const next6 = h.precipitation_probability.slice(i0+1, i0+7), p6 = next6.length ? Math.max(...next6) : pNext;
  const mm6 = sum(h.precipitation.slice(i0+1, i0+7));
  const rainLine = pNext>=10 || p6>=10
    ? `Chuva ${pNext}% na próxima hora · até ${p6}% em 6 h${mm6>=0.5?` (${r1(mm6)} mm)`:""}`
    : `Sem chuva prevista nas próximas 6 h`;
  const [, bn] = beaufort(c.wind_speed_10m);
  const lines = [
    `${state.loc.name} · sensação ${r0(c.apparent_temperature)}° · ↑${r0(dd.temperature_2m_max[0])}° ↓${r0(dd.temperature_2m_min[0])}°`,
    rainLine,
    `Vento ${dirTxt(c.wind_direction_10m)} ${r0(c.wind_speed_10m)} km/h (${bn.toLowerCase()}) · rajadas ${r0(c.wind_gusts_10m)} km/h`
  ];
  const off = state.official || [];
  if(off.length) lines.push(`⚠ ${off.length===1 ? `Alerta: ${off[0].title} (${off[0].src})` : `${off.length} alertas oficiais: ${off[0].title} e mais ${off.length-1}`}`);
  return { t, title:`${t}° · ${wmo(c.weather_code)[0]}`, body: lines.join("\n") };
}
function renderPreview(){
  if(!state.data) return; const b = barContent();
  $("#pvBadge").textContent = b.t+"°"; $("#pvTitle").textContent = b.title; $("#pvBody").textContent = b.body;
  weatherIconPng().then(u=>{ if(u) $("#notifPreview img").src = u; });
}
/* ícone da notificação: o desenho do tempo atual (sol, nuvem, chuva...) em vez do logo */
let wxIconCache = {key:"", url:""};
async function weatherIconPng(){
  if(!state.data) return "";
  const c = state.data.current, key = `${c.weather_code}-${c.is_day}-${Math.round(c.wind_gusts_10m/10)}`;
  if(wxIconCache.key===key) return wxIconCache.url;
  try{
    const im = await svgImg(icon(c.weather_code, c.is_day, {gust:c.wind_gusts_10m, cloud:c.cloud_cover, forDark:1}), 150); if(!im) return "";
    const cv = document.createElement("canvas"); cv.width = cv.height = 192; const x = cv.getContext("2d");
    x.fillStyle = c.is_day ? "#2d74c4" : "#16244a"; x.beginPath(); x.roundRect ? x.roundRect(0,0,192,192,40) : x.rect(0,0,192,192); x.fill();
    x.drawImage(im, 21, 16, 150, 150);
    x.fillStyle = "#ffffff"; x.font = '700 22px "Barlow Condensed", sans-serif'; x.textAlign = "center"; x.fillText("PWSIS", 96, 182);
    wxIconCache = {key, url: cv.toDataURL("image/png")}; return wxIconCache.url;
  }catch(e){ return ""; }
}
async function updateBarNotification(){
  if(!prefs.bar || !hasNotif || Notification.permission!=="granted" || !state.data) return;
  const reg = await swReg(); if(!reg) return;
  const b = barContent(), ic = await weatherIconPng();
  const hora = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  try{ await reg.showNotification(b.title, {tag:"wx-now", silent:true, renotify:false, body:`${b.body}\nAtualizado ${hora} · Tempo Agora PWSIS`, icon: ic || "icon-192.png", badge:tempBadge(b.t), data:{url:"index.html#agora"}}); }catch(e){}
}
async function clearBarNotification(){ const reg = await swReg(); if(!reg) return; (await reg.getNotifications({tag:"wx-now"})).forEach(n=>n.close()); }

/* envia local e preferências ao service worker, que atualiza em segundo plano */
async function syncWorker(){
  const reg = await swReg(); if(!reg || !reg.active || !state.loc) return;
  const {name,ibge,state:uf} = state.loc, lat = rc(state.loc.lat), lon = rc(state.loc.lon);
  reg.active.postMessage({type:"config", loc:{lat,lon,name,ibge,state:uf}, prefs:{...prefs}, seen:store.get("wx_seen")||[]});
}
async function registerBackground(){
  const box = $("#bgState"), reg = await swReg();
  if(!prefs.bar && !prefs.alerts){ box.textContent = "Ative uma das opções acima para ver o status do segundo plano."; return; }
  if(!reg){ box.textContent = "Notificações em segundo plano só funcionam com o app instalado a partir de um link https (veja as opções abaixo da tela)."; return; }
  if(!("periodicSync" in reg)){ box.innerHTML = "<b>Com o app aberto:</b> atualiza a cada 10 minutos. <b>Com o app fechado:</b> este navegador não permite atualização em segundo plano (é o caso do iPhone). Abra o app de vez em quando para atualizar."; return; }
  try{
    const st = await navigator.permissions.query({name:"periodic-background-sync"});
    if(st.state!=="granted"){ box.innerHTML = "<b>Segundo plano ainda não liberado.</b> O Chrome só libera depois que o app é <b>instalado</b> e usado por alguns dias. Enquanto isso, atualiza sempre que você abrir o app."; return; }
    await reg.periodicSync.register("wx-update", {minInterval: 60*60*1000});
    box.innerHTML = "<b>Segundo plano ativo.</b> O Chrome atualiza o tempo e checa alertas oficiais sozinho, em intervalos que ele decide (geralmente de 1 a 12 horas, conforme bateria e uso).";
  }catch(e){ box.textContent = "Não foi possível ativar o segundo plano neste aparelho. O app atualiza ao ser aberto."; }
}
async function setPref(key, on){
  if(on){
    if(!hasNotif){ toast("Este navegador não suporta notificações."); $("#opt"+(key==="bar"?"Bar":"Alerts")).checked=false; return; }
    const p = Notification.permission==="granted" ? "granted" : await Notification.requestPermission();
    if(p!=="granted"){ toast("Permissão negada. Libere em Configurações › Apps › Chrome › Notificações."); $("#opt"+(key==="bar"?"Bar":"Alerts")).checked=false; return; }
  }
  prefs[key] = on; store.set("wx_prefs", prefs);
  if(key==="bar") on ? updateBarNotification() : clearBarNotification();
  if(key==="alerts" && on){ store.set("wx_seen", []); notifyNew(state.official||[]); }
  syncWorker(); registerBackground(); refreshNotifUI();
}
function refreshNotifUI(){
  $("#optBar").checked = prefs.bar; $("#optAlerts").checked = prefs.alerts;
  const perm = hasNotif ? Notification.permission : "indisponível";
  $("#notifSupport").textContent = !hasNotif ? "Não suportado aqui" : perm==="granted" ? "Permitidas" : perm==="denied" ? "Bloqueadas no aparelho" : "Ainda não permitidas";
  $("#btnTestNotif").hidden = !(hasNotif && perm==="granted" && hasSW);
  $("#btnInstall").hidden = !installEvt;
}
$("#optBar").addEventListener("change", e=>setPref("bar", e.target.checked));
$("#optAlerts").addEventListener("change", e=>setPref("alerts", e.target.checked));
$("#goNotify").addEventListener("click", ()=>$("#notifPanel").scrollIntoView({behavior:"smooth"}));
$("#btnTestNotif").addEventListener("click", async ()=>{ const reg = await swReg(); if(!reg) return;
  reg.showNotification("Teste · Tempo Agora PWSIS", {body:"As notificações da PWSIS estão funcionando neste aparelho.", icon:"icon-192.png", badge:"badge-96.png", tag:"wx-test"}); });
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; refreshNotifUI(); });
window.addEventListener("appinstalled", ()=>{ installEvt = null; refreshNotifUI(); toast("App instalado. Procure o ícone Tempo na tela inicial."); });
$("#btnInstall").addEventListener("click", async ()=>{ if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; refreshNotifUI(); });

/* =============== instalação guiada =============== */
const UA = navigator.userAgent || "";
const isStandalone = () => { try{ return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }catch(e){ return false; } };
function browserKind(){
  if(/iPhone|iPad|iPod/i.test(UA)) return /CriOS|FxiOS|EdgiOS/i.test(UA) ? "ios-other" : "ios";
  if(/GitHub|FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|Telegram/i.test(UA)) return "inapp";
  if(/SamsungBrowser/i.test(UA)) return "samsung";
  if(/Firefox/i.test(UA)) return "firefox";
  if(/EdgA/i.test(UA)) return "edge";
  if(/Chrome/i.test(UA) && /Android/i.test(UA)) return "chrome";
  return "desktop";
}
function renderInstall(){
  const card = $("#installCard");
  let dismissed = false; try{ dismissed = sessionStorage.getItem("wx_inst_x")==="1"; }catch(e){}
  if(isStandalone() || dismissed){ card.hidden = true; return; }
  const url = location.href.split("#")[0];
  const steps = {
    inapp: `Você abriu o link <b>dentro de outro app</b>, que não permite instalar.<ol><li>Toque em <kbd>⋮</kbd> (ou <kbd>…</kbd>) no canto da tela.</li><li>Escolha <b>Abrir no Chrome</b> / <b>Abrir no navegador</b>.</li><li>No Chrome, siga o aviso que vai aparecer aqui.</li></ol><button class="btn ghost" id="copyUrl">Copiar link para colar no Chrome</button>`,
    chrome: `<ol><li>Toque em <kbd>⋮</kbd> no canto superior direito do Chrome.</li><li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme em <b>Instalar</b>.</li></ol>`,
    samsung: `<ol><li>Toque em <kbd>≡</kbd> na barra de baixo.</li><li>Toque em <b>Adicionar página a</b> → <b>Tela inicial</b>.</li></ol>Se preferir, abra no Chrome para ter as notificações em segundo plano.`,
    edge: `<ol><li>Toque em <kbd>…</kbd> na barra de baixo.</li><li>Toque em <b>Adicionar ao telefone</b>.</li></ol>`,
    firefox: `<ol><li>Toque em <kbd>⋮</kbd> no canto de cima.</li><li>Toque em <b>Mais</b> (···).</li><li>Toque em <b>Adicionar aplicativo à tela inicial do dispositivo</b>.</li></ol>No Firefox a notificação com o app fechado não funciona. Para ela, instale pelo <b>Chrome</b>.`,
    ios: `<ol><li>Toque no botão <b>Compartilhar</b> (quadrado com seta) do Safari.</li><li>Role e toque em <b>Adicionar à Tela de Início</b>.</li></ol>`,
    "ios-other": `No iPhone só o <b>Safari</b> instala apps. Copie o link e abra no Safari.<br><button class="btn ghost" id="copyUrl">Copiar link</button>`,
    desktop: `No computador: clique no ícone de instalar na barra de endereço do Chrome ou Edge. No celular: abra este link no Chrome.`
  };
  const kind = browserKind();
  $("#installHow").innerHTML = (installEvt ? `<button class="btn" id="installNow">Instalar agora</button><div style="margin-top:8px;color:var(--muted)">Ou, pelo menu:</div>` : "") + steps[kind];
  card.hidden = false;
  const now = $("#installNow"); if(now) now.onclick = async ()=>{ installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if(r.outcome!=="accepted") renderInstall(); };
  const cp = $("#copyUrl"); if(cp) cp.onclick = async ()=>{ try{ await navigator.clipboard.writeText(url); toast("Link copiado. Cole na barra de endereço do navegador."); }catch(e){ toast(url); } };
}
$("#installClose").addEventListener("click", ()=>{ try{ sessionStorage.setItem("wx_inst_x","1"); }catch(e){} $("#installCard").hidden = true; });
window.addEventListener("beforeinstallprompt", ()=>setTimeout(renderInstall,0));
window.addEventListener("appinstalled", ()=>{ $("#installCard").hidden = true; });
try{ renderInstall(); }catch(e){}

/* =============== compartilhar =============== */
const appUrl = () => location.protocol.startsWith("http") ? location.origin + location.pathname.replace(/index\.html$/,"") : "https://eliabeanger.github.io/tempo_agora/";
async function shareOut(title, text, url){
  const full = url ? `${text}\n${url}` : text;
  if(navigator.share){ try{ await navigator.share({title, text, url}); return; }catch(e){ if(e && e.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(full); toast("Copiado. Cole no WhatsApp ou onde quiser."); }
  catch(e){ toast(url || text); }
}
function shareApp(){
  shareOut("Tempo Agora PWSIS", "Tempo Agora PWSIS: previsão pelo GPS, alertas oficiais do INMET e da Defesa Civil, radar e dicas para o campo. Abra o link e toque em Instalar:", appUrl());
}
$("#btnShareApp").addEventListener("click", shareApp);
$("#btnShareApp2").addEventListener("click", shareApp);
$("#btnShareWx").addEventListener("click", ()=>{
  if(!state.data){ toast("Aguarde a previsão carregar."); return; }
  const c = state.data.current, d = state.data.daily;
  const amanha = d.time[1] ? `Amanhã: ${wmo(d.weather_code[1])[0].toLowerCase()}, ↑${r0(d.temperature_2m_max[1])}° ↓${r0(d.temperature_2m_min[1])}°, chuva ${r0(d.precipitation_probability_max[1])}%.` : "";
  const al = (state.official||[]).length ? `⚠ Alertas oficiais: ${state.official.map(a=>`${a.title} (${a.src}${a.sevTxt?", "+a.sevTxt:""})`).join("; ")}.` : "Sem alertas oficiais agora.";
  const text = `🌦 Tempo em ${state.loc.name} agora: ${r0(c.temperature_2m)}°, ${wmo(c.weather_code)[0].toLowerCase()}. Sensação ${r0(c.apparent_temperature)}°. Hoje ↑${r0(d.temperature_2m_max[0])}° ↓${r0(d.temperature_2m_min[0])}°, chuva ${r0(d.precipitation_probability_max[0])}%, vento ${r0(c.wind_speed_10m)} km/h.\n${amanha}\n${al}\n\nVeja no app Tempo Agora PWSIS:`;
  shareOut(`Tempo em ${state.loc.name}`, text, appUrl());
});

/* alertas oficiais novos → notificação com som */
async function notifyNew(list){
  const seen = new Set(store.get("wx_seen")||[]); const fresh = list.filter(a=>!seen.has(a.id));
  list.forEach(a=>seen.add(a.id)); store.set("wx_seen",[...seen].slice(-200));
  syncWorker();
  if(!prefs.alerts || !fresh.length || !hasNotif || Notification.permission!=="granted") return;
  const reg = await swReg();
  for(const a of fresh){
    const opt = {body:`${a.src} · ${a.sevTxt||""}${a.end?" · até "+fmtDT(a.end):""} · Tempo Agora PWSIS`, icon:"icon-192.png", badge:"badge-96.png", tag:a.id, requireInteraction:true, data:{url:"index.html#agora"}};
    try{ reg ? reg.showNotification("⚠ "+a.title, opt) : new Notification("⚠ "+a.title, opt); }catch(e){}
  }
}

/* =============== render principal =============== */
function nowIndex(){ const d=state.data, cur=d.current.time.slice(0,13)+":00"; const i=d.hourly.time.indexOf(cur); return i<0?0:i; }
function whenTxt(iso){ const dt=parseLocal(iso), td=parseLocal(state.data.current.time);
  const diff=Math.round((new Date(dt.getFullYear(),dt.getMonth(),dt.getDate())-new Date(td.getFullYear(),td.getMonth(),td.getDate()))/864e5);
  return `${diff===0?"hoje":diff===1?"amanhã":DIAS_L[dt.getDay()].toLowerCase()} ${hhmm(iso)}`; }

function renderWeather(){
  const d=state.data, c=d.current, h=d.hourly, i=nowIndex(), k=wmo(c.weather_code)[1];
  // céu dinâmico
  const light = document.documentElement.dataset.theme==="light";
  const sky = light
    ? (!c.is_day ? ["#b9c8e4","#e3eaf6"] : k==="storm" ? ["#b8b0dc","#e6e4f4"] : ["rain","heavy","shower","drizzle"].includes(k) ? ["#a9bfd9","#e2eaf4"] : ["cloud","fog"].includes(k) ? ["#c3cfdf","#e8eef6"] : ["#8fc4f5","#e4f0fc"])
    : (!c.is_day ? ["#16244a","#0b1426"] : k==="storm" ? ["#43357a","#141a33"] : ["rain","heavy","shower","drizzle"].includes(k) ? ["#2c4466","#0f1a2e"] : ["cloud","fog"].includes(k) ? ["#3a4c6b","#101b30"] : ["#2d74c4","#0f1f3a"]);
  document.documentElement.style.setProperty("--sky1",sky[0]); document.documentElement.style.setProperty("--sky2",sky[1]);
  document.querySelector('meta[name="theme-color"]').content = sky[0];

  $("#temp").innerHTML = `${r0(c.temperature_2m)}<sup>°C</sup>`;
  $("#heroIco").innerHTML = icon(c.weather_code, c.is_day, {gust:c.wind_gusts_10m, cloud:c.cloud_cover});
  const dd = d.daily;
  $("#cond").innerHTML = `<b>${wmo(c.weather_code)[0]}</b><span>Sensação ${r0(c.apparent_temperature)}°</span><span class="hl">↑${r0(dd.temperature_2m_max[0])}° ↓${r0(dd.temperature_2m_min[0])}°</span><span>Chuva ${r0(dd.precipitation_probability_max[0])}%</span>`;
  $("#updated").textContent = "Leitura " + hhmm(c.time);

  const pPrev=h.pressure_msl[Math.max(0,i-3)], dp=c.pressure_msl-pPrev;
  const trend = Math.abs(dp)<0.6?"estável":dp>0?`subindo ${r1(dp)}`:`caindo ${r1(-dp)}`;
  const vis=h.visibility[i], uv=h.uv_index[i];
  const uvT = uv<3?"Baixo":uv<6?"Moderado":uv<8?"Alto":uv<11?"Muito alto":"Extremo";
  const m = [
    ["Umidade",`${r0(c.relative_humidity_2m)}<small>%</small>`,`Orvalho ${r0(h.dew_point_2m[i])}°`,c.relative_humidity_2m,"var(--accent)"],
    ["Pressão",`${r0(c.pressure_msl)}<small>hPa</small>`,`3 h: ${trend}`,null],
    ["Índice UV",r1(uv),uvT,Math.min(100,uv/11*100),uv<3?"var(--ok)":uv<6?"var(--warn)":uv<8?"var(--orange)":"var(--danger)"],
    ["Nuvens",`${r0(c.cloud_cover)}<small>%</small>`,c.cloud_cover<20?"Céu aberto":c.cloud_cover<60?"Nuvens esparsas":"Encoberto",c.cloud_cover,"var(--muted)"],
    ["Visibilidade",`${vis>=10000?r0(vis/1000):r1(vis/1000)}<small>km</small>`,vis<1000?"Neblina":vis<5000?"Reduzida":"Boa",null],
    ["Chuva agora",`${r1(c.precipitation)}<small>mm</small>`,`Próx. hora ${r0(h.precipitation_probability[i+1])}%`,h.precipitation_probability[i+1],"var(--accent)"],
  ];
  $("#metrics").innerHTML = m.map(x=>`<div class="metric"><span class="label">${x[0]}</span><span class="v num">${x[1]}</span><span class="d">${x[2]}</span>${x[3]!=null?`<div class="meter"><i style="width:${x[3]}%;--c:${x[4]}"></i></div>`:""}</div>`).join("");

  renderWind(c); renderTimeline(i); renderAlerts(); renderDays(); renderSummary(); renderAgro(); renderMoonCal(); renderSun();
  renderPreview(); updateBarNotification();
  renderNowcast(); renderDaySum(); renderFavs(); setFx(); renderCropChips(); renderCrop(); renderAgenda();
  trimDays(); addHelpButtons();
  if(state.view==="graficos") renderChart();
}

function renderWind(c){
  const dir=c.wind_direction_10m, spd=c.wind_speed_10m, gust=c.wind_gusts_10m;
  const ticks = Array.from({length:72},(_,n)=>{const a=n*5*Math.PI/180,L=n%6===0,r1=86,r2=L?76:81;return `<line x1="${(100+r1*Math.sin(a)).toFixed(1)}" y1="${(100-r1*Math.cos(a)).toFixed(1)}" x2="${(100+r2*Math.sin(a)).toFixed(1)}" y2="${(100-r2*Math.cos(a)).toFixed(1)}" stroke="var(--line)" stroke-width="${L?2:1}"/>`}).join("");
  const labels = [["N",0,"n"],["L",90,""],["S",180,""],["O",270,""]].map(([t,a,cl])=>{const r=a*Math.PI/180;return `<text class="${cl}" x="${100+64*Math.sin(r)}" y="${104-64*Math.cos(r)}" text-anchor="middle">${t}</text>`}).join("");
  $("#compass").innerHTML = `<circle cx="100" cy="100" r="92" fill="var(--panel2)" stroke="var(--line)"/>${ticks}${labels}
    <g style="transform:rotate(${dir}deg);transform-origin:100px 100px;transition:transform 1s"><line x1="100" y1="30" x2="100" y2="160" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/><path d="M100 172 L88 150 L112 150 Z" fill="var(--accent)"/><circle cx="100" cy="30" r="6" fill="var(--bg)" stroke="var(--accent)" stroke-width="3"/></g>
    <circle cx="100" cy="100" r="30" fill="var(--panel)" stroke="var(--line)"/><text x="100" y="98" text-anchor="middle" style="font:700 20px var(--f-display);fill:var(--fg)">${r0(spd)}</text><text x="100" y="114" text-anchor="middle">km/h</text>`;
  const [b,bn]=beaufort(spd), bc=b<4?"var(--ok)":b<6?"var(--accent)":b<8?"var(--warn)":"var(--danger)";
  $("#windData").innerHTML = `<div><span class="label">Velocidade média</span><div class="big num">${r0(spd)} <small>km/h</small></div></div>
    <div><span class="label">Beaufort ${b} · ${bn}</span><div class="bft" style="--c:${bc}">${Array.from({length:12},(_,n)=>`<i class="${n<b?"on":""}"></i>`).join("")}</div></div>
    <dl class="kv"><dt>Rajadas</dt><dd>${r0(gust)} km/h</dd><dt>Vem de</dt><dd>${dirTxt(dir)} (${r0(dir)}°)</dd><dt>Em nós</dt><dd>${r1(spd/1.852)} kt</dd><dt>Em m/s</dt><dd>${r1(spd/3.6)}</dd><dt>Rajada máx. hoje</dt><dd>${r0(state.data.daily.wind_gusts_10m_max[0])} km/h</dd></dl>`;
}

function renderTimeline(i0){
  const h=state.data.hourly; let html="";
  for(let i=i0;i<Math.min(h.time.length,i0+48);i++){
    const t=h.time[i]; if(i>i0 && t.slice(11,13)==="00"){ const dt=parseLocal(t); html+=`<div class="daysep"><span>${DIAS[dt.getDay()]} ${dt.getDate()}</span></div>`; }
    const pp=h.precipitation_probability[i], wc=h.weather_code[i], hot=wc>=95||h.wind_gusts_10m[i]>=55;
    html += `<div class="hour ${i===i0?"now":""} ${hot?"hot":""}" data-i="${i}" role="button" tabindex="0" title="${wmo(wc)[0]}"><span class="t">${i===i0?"Agora":hhmm(t)}</span>${icon(wc,h.is_day[i],{gust:h.wind_gusts_10m[i],cloud:h.cloud_cover[i]})}<span class="tp num">${r0(h.temperature_2m[i])}°</span><span class="pp">${pp>=10?pp+"%":""}</span><span class="ws">${arrowSvg(h.wind_direction_10m[i])}${r0(h.wind_speed_10m[i])}</span></div>`;
  }
  $("#timeline").innerHTML = html;
}

/* =============== gráficos =============== */
$$(".tab").forEach(b=>b.addEventListener("click",()=>{ $$(".tab").forEach(x=>x.setAttribute("aria-selected",x===b)); state.chartKey=b.dataset.k; store.set("wx_tab",state.chartKey); renderChart(); }));
const CV = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
if(typeof Chart!=="undefined" && Chart.defaults && Chart.defaults.font){ Chart.defaults.font.family = 'Figtree, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; Chart.defaults.color = "#93a3c0"; }
function chartOpts(scales, titleCb){
  const grid=CV("--line"), muted=CV("--muted"), fg=CV("--fg");
  return {responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{labels:{color:fg,boxWidth:12,font:{family:"Figtree"}}},tooltip:{backgroundColor:CV("--panel2"),borderColor:grid,borderWidth:1,titleColor:fg,bodyColor:fg,callbacks:titleCb?{title:titleCb}:{}}},
    scales:{x:{grid:{color:grid+"66"},ticks:{color:muted,maxRotation:0,autoSkip:true,maxTicksLimit:9}},...scales}};
}
const yAx = (t,e={}) => ({grid:{color:CV("--line")},ticks:{color:CV("--muted")},title:{display:true,text:t,color:CV("--muted")},...e});
const L_ = (label,data,color,e={}) => ({type:"line",label,data,borderColor:color,backgroundColor:color+"33",borderWidth:2,pointRadius:0,tension:.35,...e});
const B_ = (label,data,color,e={}) => ({type:"bar",label,data,backgroundColor:color+"cc",borderRadius:3,...e});
function renderChart(){
  if(state.view==="graficos" && typeof Chart==="undefined"){ $("#chartNote").textContent = "Os gráficos precisam de internet na primeira abertura para carregar. Toque em atualizar quando estiver conectado."; return; }
  if(!state.data || typeof Chart==="undefined" || state.view!=="graficos") return;
  const h=state.data.hourly, i0=nowIndex(), end=Math.min(h.time.length,i0+48), sl=a=>a.slice(i0,end);
  const labels = sl(h.time).map(t=>t.slice(11,13)==="00"?`${DIAS[parseLocal(t).getDay()]} 0h`:`${+t.slice(11,13)}h`);
  let ds, sc, note="", lab=labels, tcb=items=>whenTxt(h.time[i0+items[0].dataIndex]);
  switch(state.chartKey){
    case "temp": ds=[L_("Temperatura °C",sl(h.temperature_2m),"#ffd166",{fill:"origin"}),L_("Sensação °C",sl(h.apparent_temperature),"#ff7a59",{borderDash:[5,4]}),L_("Orvalho °C",sl(h.dew_point_2m),"#62ccff")]; sc={y:yAx("°C")}; note="Quando o ponto de orvalho encosta na temperatura, há chance de neblina ou orvalho."; break;
    case "rain": ds=[B_("Chuva (mm)",sl(h.precipitation),"#3aa8ff",{yAxisID:"y"}),L_("Probabilidade %",sl(h.precipitation_probability),"#b594ff",{yAxisID:"y1"})]; sc={y:yAx("mm",{beginAtZero:true,suggestedMax:2}),y1:yAx("%",{position:"right",min:0,max:100,grid:{drawOnChartArea:false}})}; note=`Total previsto em 48 h: ${r1(sum(sl(h.precipitation)))} mm.`; break;
    case "wind": ds=[L_("Vento médio km/h",sl(h.wind_speed_10m),"#62ccff",{fill:"origin"}),L_("Rajadas km/h",sl(h.wind_gusts_10m),"#ff5468",{borderDash:[5,4]})]; sc={y:yAx("km/h",{beginAtZero:true})}; note=`Rajada máxima em 48 h: ${r0(Math.max(...sl(h.wind_gusts_10m)))} km/h.`; break;
    case "hum": ds=[L_("Umidade %",sl(h.relative_humidity_2m),"#4ade80",{yAxisID:"y",fill:"origin"}),L_("Nuvens %",sl(h.cloud_cover),"#93a3c0",{yAxisID:"y",borderDash:[3,3]}),L_("Pressão hPa",sl(h.pressure_msl),"#ffd166",{yAxisID:"y1"})]; sc={y:yAx("%",{min:0,max:100}),y1:yAx("hPa",{position:"right",grid:{drawOnChartArea:false}})}; note="Pressão caindo rápido costuma anteceder mau tempo."; break;
    case "uv": ds=[B_("Índice UV",sl(h.uv_index),"#ffd166",{yAxisID:"y"}),L_("CAPE J/kg",sl(h.cape),"#b594ff",{yAxisID:"y1",fill:"origin"})]; sc={y:yAx("UV",{beginAtZero:true,suggestedMax:11}),y1:yAx("J/kg",{position:"right",beginAtZero:true,grid:{drawOnChartArea:false}})}; note="CAPE mede a energia para formar tempestades: acima de 1000 há instabilidade, acima de 2500 risco de temporal."; break;
    case "soil": ds=[L_("Temp. do solo °C",sl(h.soil_temperature_0cm),"#ff7a59",{yAxisID:"y"}),L_("Umidade 0–1 cm",sl(h.soil_moisture_0_to_1cm),"#4ade80",{yAxisID:"y1",fill:"origin"}),L_("Umidade 3–9 cm",sl(h.soil_moisture_3_to_9cm),"#62ccff",{yAxisID:"y1"})]; sc={y:yAx("°C"),y1:yAx("m³/m³",{position:"right",beginAtZero:true,grid:{drawOnChartArea:false}})}; note="Umidade do solo em m³/m³: abaixo de 0,15 é seco; entre 0,25 e 0,35 é bom para plantio."; break;
    case "daily": { const dd=state.data.daily; lab=dd.time.map((t,n)=>{const x=parseLocal(t);return n===0?"Hoje":`${DIAS[x.getDay()]} ${x.getDate()}`}); tcb=null;
      ds=[B_("Chuva (mm)",dd.precipitation_sum,"#3aa8ff",{yAxisID:"y1",order:3}),L_("Máx °C",dd.temperature_2m_max,"#ff7a59",{yAxisID:"y",pointRadius:3}),L_("Mín °C",dd.temperature_2m_min,"#62ccff",{yAxisID:"y",pointRadius:3}),L_("Horas de sol",dd.sunshine_duration.map(s=>+(s/3600).toFixed(1)),"#ffd166",{yAxisID:"y2",pointRadius:2,borderDash:[4,4]})];
      sc={y:yAx("°C"),y1:yAx("mm",{position:"right",beginAtZero:true,grid:{drawOnChartArea:false}}),y2:{display:false,beginAtZero:true,max:16}}; note=`Chuva total em 14 dias: ${r0(sum(dd.precipitation_sum))} mm.`; }
  }
  if(state.chart) state.chart.destroy();
  state.chart = new Chart($("#chart"),{data:{labels:lab,datasets:ds},options:chartOpts(sc,tcb)});
  $("#chartNote").textContent = note;
  const hk = {temp:"orvalho", rain:"chance", wind:"beaufort", hum:"pressao", uv:"cape", soil:"solo", daily:"mm"}[state.chartKey];
  if(hk) $("#chartNote").insertAdjacentHTML("beforeend", ` <button class="qi" data-help="${hk}" aria-label="Explicação">?</button>`);
}

/* consenso dos modelos */
const MODELS = [["ecmwf_ifs025","ECMWF","#62ccff"],["gfs_seamless","GFS","#ffd166"],["icon_seamless","ICON","#4ade80"],["jma_seamless","JMA","#b594ff"]];
async function loadModels(){
  try{
    const lat = rc(state.loc.lat), lon = rc(state.loc.lon);
    state.models = await getData(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=${MODELS.map(m=>m[0]).join(",")}&timezone=auto&forecast_days=7`);
    renderModels();
  }catch(e){ $("#consensus").innerHTML = `<p class="muted">Comparação de modelos indisponível agora.</p>`; }
}
function renderModels(){
  const M = state.models; if(!M || !M.daily) return; const d=M.daily;
  const get = (v,m) => d[`${v}_${m}`] || [];
  let html = `<div class="crow h"><span>Dia</span>${MODELS.map(m=>`<span style="text-align:center;color:${m[2]}">${m[1]}</span>`).join("")}<span style="text-align:center">Conf.<button class="qi" data-help="confianca" aria-label="O que é a confiança">?</button></span></div>`;
  d.time.forEach((t,n)=>{
    const x=parseLocal(t), mx=MODELS.map(m=>get("temperature_2m_max",m[0])[n]), pr=MODELS.map(m=>get("precipitation_sum",m[0])[n]);
    const vmx=mx.filter(ok), vpr=pr.filter(ok);
    const spreadT = vmx.length? Math.max(...vmx)-Math.min(...vmx) : 0;
    const rainy = vpr.filter(v=>v>=1).length, agreeRain = rainy===0||rainy===vpr.length;
    const spreadR = vpr.length? Math.max(...vpr)-Math.min(...vpr) : 0;
    const conf = spreadT<=2 && agreeRain && spreadR<10 ? ["a","Alta"] : spreadT<=4 && (agreeRain||spreadR<8) ? ["m","Média"] : ["b","Baixa"];
    html += `<div class="crow"><span class="dl"><b>${n===0?"Hoje":DIAS[x.getDay()]}</b><small>${x.getDate()}/${x.getMonth()+1}</small></span>${MODELS.map((m,i)=>`<span class="m">${r0(mx[i])}°<small>${ok(pr[i])?r1(pr[i])+"mm":"—"}</small></span>`).join("")}<span class="conf ${conf[0]}">${conf[1]}</span></div>`;
  });
  $("#consensus").innerHTML = html;
  if(state.view!=="graficos" || typeof Chart==="undefined") return;
  if(state.chartM) state.chartM.destroy();
  const lab = d.time.map((t,n)=>{const x=parseLocal(t);return n===0?"Hoje":`${DIAS[x.getDay()]} ${x.getDate()}`});
  state.chartM = new Chart($("#chartModels"),{data:{labels:lab,datasets:MODELS.map(m=>B_(`${m[1]} (mm)`,get("precipitation_sum",m[0]),m[2]))},options:chartOpts({y:yAx("mm de chuva",{beginAtZero:true})})});
}

/* =============== 14 dias, resumo, lua, sol =============== */
function renderDays(){
  const d=state.data.daily, lo=Math.min(...d.temperature_2m_min), hi=Math.max(...d.temperature_2m_max), sp=Math.max(1,hi-lo);
  $("#days").innerHTML = d.time.map((t,n)=>{
    const dt=parseLocal(t), mn=d.temperature_2m_min[n], mx=d.temperature_2m_max[n], pp=d.precipitation_probability_max[n], mm=d.precipitation_sum[n];
    return `<details class="dayd"><summary><div class="day">
      <div class="dn">${n===0?"Hoje":n===1?"Amanhã":DIAS[dt.getDay()]}<small>${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}</small></div>
      ${icon(d.weather_code[n],1,{gust:d.wind_gusts_10m_max[n]})}
      <div class="rain">${pp>=10?pp+"%":""}<small>${mm>=0.5?r1(mm)+" mm":""}</small></div>
      <div class="mm"><span class="mn num">${r0(mn)}°</span><div class="range"><i style="left:${(mn-lo)/sp*100}%;width:${Math.max(4,(mx-mn)/sp*100)}%"></i></div></div>
      <span class="mx num">${r0(mx)}°</span></div></summary>
      <div class="dayx"><b>${wmo(d.weather_code[n])[0]}</b><span>Sensação ${r0(d.apparent_temperature_min[n])}° a ${r0(d.apparent_temperature_max[n])}°</span><span>Vento ${r0(d.wind_speed_10m_max[n])} km/h ${dirTxt(d.wind_direction_10m_dominant[n])}</span><span>Rajadas ${r0(d.wind_gusts_10m_max[n])} km/h</span><span>${r0(d.precipitation_hours[n])} h de chuva</span><span>${r1(d.sunshine_duration[n]/3600)} h de sol</span><span>UV ${r1(d.uv_index_max[n])}</span><span>Sol ${hhmm(d.sunrise[n])}–${hhmm(d.sunset[n])}</span></div></details>`;
  }).join("");
}
function renderSummary(){
  const d=state.data.daily, N=d.time.length; let rain=0,sunny=0,windy=0,storm=0,frost=0;
  const cells = d.time.map((t,n)=>{ const mm=d.precipitation_sum[n], sun=d.sunshine_duration[n]/3600, wc=d.weather_code[n]; let col;
    if(wc>=95){storm++;rain++;col="var(--storm)";} else if(mm>=1){rain++;col="#3aa8ff";} else if(sun>=7){sunny++;col="var(--sun)";} else col="#93a3c0";
    if(d.wind_gusts_10m_max[n]>=50) windy++; if(d.temperature_2m_min[n]<=3) frost++;
    const dt=parseLocal(t); return `<div style="background:${col}" title="${dt.toLocaleDateString("pt-BR")} · ${wmo(wc)[0]} · ${r1(mm)} mm">${dt.getDate()}</div>`; }).join("");
  const tot=sum(d.precipitation_sum), et=sum(d.et0_fao_evapotranspiration), bal=tot-et;
  const S=(l,v,dsc)=>`<div class="sum"><span class="label">${l}</span><span class="v num">${v}</span><span class="d">${dsc}</span></div>`;
  $("#summary").innerHTML = S("Dias com chuva",rain,`${r0(tot)} mm no período`)+S("Dias de sol",sunny,`${r0(sum(d.sunshine_duration)/3600)} h de sol`)+S("Vento forte",windy,"dias com rajada ≥ 50 km/h")+S("Trovoada",storm,frost?`${frost} dia(s) com risco de geada`:"sem risco de geada")
    +S("Média das máx.",r1(sum(d.temperature_2m_max)/N)+"°",`maior ${r0(Math.max(...d.temperature_2m_max))}°`)+S("Média das mín.",r1(sum(d.temperature_2m_min)/N)+"°",`menor ${r0(Math.min(...d.temperature_2m_min))}°`)
    +S("Evapotranspiração",r0(et),"mm (ET₀)")+S("Balanço hídrico",(bal>=0?"+":"")+r0(bal),"mm (chuva − ET₀)")
    +`<div class="strip">${cells}</div><div class="legend"><span><i style="background:var(--sun)"></i>Sol</span><span><i style="background:#93a3c0"></i>Nublado/seco</span><span><i style="background:#3aa8ff"></i>Chuva</span><span><i style="background:var(--storm)"></i>Trovoada</span></div>`;
}
const SYN=29.530588853;
const moonAge = date => ((((date-Date.UTC(2000,0,6,18,14))/864e5)%SYN)+SYN)%SYN;
function moonSvg(age,south){ const r=20,k=Math.cos(2*Math.PI*age/SYN),sw=age<SYN/2?1:0,rx=Math.abs(k)*r;
  const p=`M24 ${24-r} A${r} ${r} 0 0 ${sw} 24 ${24+r} A${rx.toFixed(2)} ${r} 0 0 ${k>0?1-sw:sw} 24 ${24-r}Z`;
  return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="${r}" fill="#26324a"/><path d="${p}" fill="#e6ecf7" ${south?'transform="translate(48,0) scale(-1,1)"':""}/></svg>`; }
const moonName = a => ["Lua nova","Lua crescente","Quarto crescente","Crescente gibosa","Lua cheia","Minguante gibosa","Quarto minguante","Lua minguante"][Math.floor(a/SYN*8+.5)%8];
function renderMoonCal(){
  const south=state.loc && state.loc.lat<0, today=new Date(); today.setHours(12,0,0,0);
  let html = DIAS.map(d=>`<div class="h">${d}</div>`).join("") + "<div></div>".repeat(today.getDay());
  for(let n=0;n<30;n++){ const dt=new Date(today.getTime()+n*864e5), a=moonAge(dt), b=moonAge(new Date(dt.getTime()+864e5));
    const key=[0,SYN/4,SYN/2,3*SYN/4].some(q=>((b-q)%SYN+SYN)%SYN < ((a-q)%SYN+SYN)%SYN);
    html += `<div class="c ${n===0?"today":""} ${key?"key":""}" title="${dt.toLocaleDateString("pt-BR")} · ${moonName(a)}">${moonSvg(a,south)}<span>${dt.getDate()}</span></div>`; }
  const a0=moonAge(new Date());
  const ph=[["Lua nova",0],["Quarto crescente",SYN/4],["Lua cheia",SYN/2],["Quarto minguante",3*SYN/4]].map(([nm,q])=>({nm,q,w:new Date(Date.now()+(((q-a0)%SYN+SYN)%SYN)*864e5)})).sort((x,y)=>x.w-y.w);
  $("#moonCal").innerHTML = `<div class="mc">${html}</div><div class="mphases">${ph.map(p=>`<div>${moonSvg(p.q+.01,south)}<div>${p.nm}<small>${DIAS[p.w.getDay()]}, ${p.w.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</small></div></div>`).join("")}</div><p class="chart-note">Datas aproximadas (±1 dia). Borda amarela: mudança de fase.</p>`;
}
function renderSun(){
  const d=state.data.daily, c=state.data.current, rise=parseLocal(d.sunrise[0]), set=parseLocal(d.sunset[0]), now=parseLocal(c.time), len=d.daylight_duration[0]/3600;
  $("#daylen").textContent = `${Math.floor(len)} h ${Math.round(len%1*60)} min de luz`;
  let p=(now-rise)/(set-rise); const up=p>=0&&p<=1; p=Math.min(1,Math.max(0,p));
  const ang=Math.PI*(1-p), cx=160+130*Math.cos(ang), cy=130-110*Math.sin(ang), a=moonAge(new Date()), ill=(1-Math.cos(2*Math.PI*a/SYN))/2;
  $("#sun").innerHTML = `<svg viewBox="0 0 320 250" role="img" aria-label="Posição do sol e fase da lua">
    <path d="M30 130 A130 110 0 0 1 290 130" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5"/><line x1="16" y1="130" x2="304" y2="130" stroke="var(--line)"/>
    ${up?`<path d="M30 130 A130 110 0 0 1 ${cx.toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="var(--sun)" stroke-width="3"/>`:""}
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="${up?"var(--sun)":"var(--muted)"}" opacity="${up?1:.5}"/>
    <text x="30" y="150" text-anchor="middle">${hhmm(d.sunrise[0])}</text><text x="290" y="150" text-anchor="middle">${hhmm(d.sunset[0])}</text>
    <text x="30" y="166" text-anchor="middle" style="font-size:10px">nascer</text><text x="290" y="166" text-anchor="middle" style="font-size:10px">pôr</text>
    <g transform="translate(36,186)">${moonSvg(a,state.loc&&state.loc.lat<0).replace("<svg",'<svg width="48" height="48"')}</g>
    <text x="96" y="205" style="fill:var(--fg);font:600 15px var(--f-body)">${moonName(a)}</text><text x="96" y="224">${Math.round(ill*100)}% iluminada · ${a.toFixed(1)} dias</text></svg>`;
}

/* =============== CAMPO =============== */
const wetBulb=(T,RH)=>T*Math.atan(0.151977*Math.sqrt(RH+8.313659))+Math.atan(T+RH)-Math.atan(RH-1.676331)+0.00391838*Math.pow(RH,1.5)*Math.atan(0.023101*RH)-4.686035;
function sprayRate(i){ const h=state.data.hourly, T=h.temperature_2m[i], RH=h.relative_humidity_2m[i], w=h.wind_speed_10m[i], g=h.wind_gusts_10m[i], dT=T-wetBulb(T,RH);
  const rn=(h.precipitation[i]||0)+(h.precipitation[i+1]||0)+(h.precipitation[i+2]||0), pp=Math.max(h.precipitation_probability[i]||0,h.precipitation_probability[i+1]||0);
  let s=2; if(w<2||w>15||g>25||dT>10||T>32||rn>=1||pp>=60) s=0; else if(w<3||w>10||g>20||dT<2||dT>8||T>30||pp>=30) s=1; return {s,dT}; }
function renderAgro(){
  const d=state.data, h=d.hourly, dd=d.daily, i0=nowIndex(), cols=["var(--danger)","var(--warn)","var(--ok)"]; let bars="", good=[];
  for(let i=i0;i<Math.min(h.time.length,i0+48);i++){ const {s}=sprayRate(i); if(s===2) good.push(i); const hr=+h.time[i].slice(11,13);
    bars += `<div title="${whenTxt(h.time[i])}"><b style="background:${cols[s]}"></b><span>${hr%6===0?hr+"h":""}</span></div>`; }
  let best=null,cur=null; good.forEach(i=>{ cur = cur&&i===cur.e+1 ? {s:cur.s,e:i} : {s:i,e:i}; if(!best||cur.e-cur.s>best.e-best.s) best={...cur}; });
  $("#agroWindow").innerHTML = `<div class="spray">${bars}</div><div class="legend"><span><i style="background:var(--ok)"></i>Ideal</span><span><i style="background:var(--warn)"></i>Com cuidado</span><span><i style="background:var(--danger)"></i>Evitar</span></div>
    <div class="bestwin">${best?`Melhor janela: <b>${whenTxt(h.time[best.s])} até ${hhmm(h.time[best.e])}</b> · ${best.e-best.s+1} h seguidas`:"Nenhuma janela ideal nas próximas 48 horas."}</div>
    <p class="chart-note">Critérios: vento 3–10 km/h, rajada abaixo de 20, Delta T entre 2 e 8 °C, temperatura abaixo de 30 °C e sem chuva nas 2 h seguintes.</p>`;
  const {dT}=sprayRate(i0), sm=h.soil_moisture_3_to_9cm[i0], vpd=h.vapour_pressure_deficit[i0], ts=h.soil_temperature_0cm[i0];
  const idx=[["Delta T",`${r1(dT)}<small>°C</small>`,dT<2?"Risco de deriva":dT<=8?"Bom p/ pulverizar":dT<=10?"Evaporação alta":"Não pulverizar"],["ET₀ hoje",`${r1(dd.et0_fao_evapotranspiration[0])}<small>mm</small>`,"Água perdida pela lavoura"],["Horas de sol",`${r1(dd.sunshine_duration[0]/3600)}<small>h</small>`,`Radiação ${r1(dd.shortwave_radiation_sum[0])} MJ/m²`],["Solo 3–9 cm",`${r0(sm*100)}<small>%</small>`,sm<0.15?"Seco":sm<0.25?"Razoável":sm<0.35?"Úmido":"Encharcado"],["Temp. do solo",`${r0(ts)}<small>°C</small>`,ts>=18?"Boa p/ germinar":"Solo frio"],["Déficit de vapor",`${r1(vpd)}<small>kPa</small>`,vpd<0.4?"Ar saturado":vpd<=1.2?"Ideal p/ plantas":"Ar seco (estresse)"]];
  $("#agroIdx").innerHTML = idx.map(m=>`<div class="metric"><span class="label">${m[0]}</span><span class="v num">${m[1]}</span><span class="d">${m[2]}</span></div>`).join("");

  const T=[], rain3=sum(dd.precipitation_sum.slice(0,3)), rain7=sum(dd.precipitation_sum.slice(0,7)), et7=sum(dd.et0_fao_evapotranspiration.slice(0,7)), rain24=sum(h.precipitation.slice(i0,i0+24));
  let dry=0; for(const mm of dd.precipitation_sum){ if(mm<1) dry++; else break; }
  const minF=Math.min(...dd.temperature_2m_min.slice(0,4)), gMax=Math.max(...h.wind_gusts_10m.slice(i0,i0+48));
  if(sm>=0.22&&sm<0.38&&ts>=15) T.push(["good","Plantio e semeadura","Solo com umidade e temperatura boas para germinar."]);
  else if(sm<0.18) T.push([rain3>=10?"mid":"bad","Plantio e semeadura",rain3>=10?`Solo seco, mas vêm ${r0(rain3)} mm em 3 dias. Semeie depois da chuva.`:"Solo seco e pouca chuva à vista. Espere umidade."]);
  else if(sm>=0.38) T.push(["mid","Plantio e semeadura","Solo encharcado: risco de compactação e atolar máquinas."]);
  else T.push(["mid","Plantio e semeadura","Solo ainda frio para germinação rápida. Culturas de inverno toleram melhor."]);
  T.push(dry>=3?["good","Colheita e secagem",`${dry} dias seguidos sem chuva. Boa janela para colher e secar grãos.`]:dry>=1?["mid","Colheita e secagem",`Só ${dry} dia(s) seco(s) antes da próxima chuva. Priorize o que está pronto.`]:["bad","Colheita e secagem","Chuva prevista hoje. Evite colher grão úmido."]);
  if(rain24>=20) T.push(["bad","Adubo e defensivos",`Cerca de ${r0(rain24)} mm em 24 h: o produto pode ser lavado. Adie a aplicação.`]);
  else if(rain24>=3) T.push(["good","Adubação nitrogenada",`Chuva leve prevista (${r0(rain24)} mm): boa para incorporar ureia.`]);
  const bal=rain7-et7; T.push(bal<-10?["bad","Irrigação",`Déficit de ${r0(-bal)} mm na semana (chuva ${r0(rain7)} × perda ${r0(et7)}). Planeje irrigar.`]:bal<0?["mid","Irrigação",`Leve déficit de ${r0(-bal)} mm na semana.`]:["good","Irrigação",`A chuva da semana (${r0(rain7)} mm) cobre a perda de água (${r0(et7)} mm).`]);
  if(minF<=3) T.push(["bad","Geada",`Mínima de ${r0(minF)} °C nos próximos dias. Proteja mudas, hortas e animais.`]);
  if(gMax>=50) T.push(["bad","Vento forte",`Rajadas de até ${r0(gMax)} km/h. Feche estufas, recolha lonas.`]);
  const pp=dd.precipitation_probability_max[0];
  T.push(pp>=50?["mid","Guarda-chuva",`${pp}% de chance de chuva hoje.`]:["good","Guarda-chuva",`Só ${pp}% de chance de chuva hoje.`]);
  const dryH=h.precipitation.slice(i0,i0+10).filter((x,n)=>x<0.1&&h.is_day[i0+n]).length;
  if(dryH>=4&&h.relative_humidity_2m[i0]<75) T.push(["good","Roupa no varal","Horas secas e de sol pela frente."]);
  if(dd.uv_index_max[0]>=6) T.push(["mid","Proteção solar",`UV até ${r1(dd.uv_index_max[0])}. Protetor e chapéu das 10h às 16h.`]);
  if(dd.temperature_2m_min[0]<=12) T.push(["mid","Agasalho",`Mínima de ${r0(dd.temperature_2m_min[0])} °C.`]);
  if(gMax>=35||h.weather_code.slice(i0,i0+24).some(c=>c>=95)) T.push(["bad","Eventos ao ar livre","Vento ou trovoada: proteja som, luz e energia; amarre tendas."]);
  const ma=moonAge(new Date());
  T.push(["moon","Calendário lunar (tradição)",(ma<1||ma>SYN-1?"Lua nova: preparo e limpeza de canteiros.":ma<SYN/2-1?"Crescente: plantar o que dá acima da terra (folhas, grãos, frutos).":ma<SYN/2+1?"Cheia: colher frutos e plantar flores.":"Minguante: raízes e tubérculos, poda, corte de madeira e bambu.")+" Costume do campo, sem comprovação científica."]);
  $("#tips").innerHTML = T.map(([c,t,p])=>`<div class="tip ${c}"><span class="st"></span><h4>${t}</h4><p>${p}</p></div>`).join("");
}

/* =============== LOCAL: ar, sobre, links, mapa =============== */
async function loadAir(){
  try{ const lat = rc(state.loc.lat), lon = rc(state.loc.lon); state.air = await getData(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide&timezone=auto`); renderAir(); }
  catch(e){ if(!state.air) $("#air").innerHTML = `<p class="muted">Qualidade do ar indisponível agora.</p>`; }
}
function renderAir(){
  if(!state.air || !state.air.current) return;
  {
    const a=state.air.current, v=a.european_aqi, c=v<=20?["Boa","var(--ok)"]:v<=40?["Razoável","#d7e04a"]:v<=60?["Moderada","var(--warn)"]:v<=80?["Ruim","var(--orange)"]:v<=100?["Muito ruim","var(--danger)"]:["Extrema","var(--storm)"];
    $("#air").innerHTML = `<div class="row" style="align-items:baseline"><span class="num" style="font:600 46px/1 var(--f-display)">${r0(v)}</span><b style="color:${c[1]}">${c[0]}</b></div><div class="aq-bar"><i style="left:${Math.min(100,v/120*100)}%"></i></div>
      <dl class="kv" style="margin-top:12px"><dt>PM2.5</dt><dd>${r1(a.pm2_5)} µg/m³</dd><dt>PM10</dt><dd>${r1(a.pm10)} µg/m³</dd><dt>Ozônio</dt><dd>${r0(a.ozone)} µg/m³</dd><dt>NO₂</dt><dd>${r1(a.nitrogen_dioxide)} µg/m³</dd><dt>US AQI</dt><dd>${r0(a.us_aqi)}</dd></dl>`;
  }
}
async function loadAbout(){
  const l=state.loc, d=state.data;
  const facts = `<dl class="kv" style="margin-top:12px">
    <dt>Coordenadas</dt><dd>${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}</dd>
    ${d&&d.elevation!=null?`<dt>Altitude</dt><dd>${r0(d.elevation)} m</dd>`:""}
    ${l.ibge?`<dt>Código IBGE</dt><dd>${l.ibge}</dd>`:""}
    ${l.micro?`<dt>Microrregião</dt><dd>${esc(l.micro)}</dd>`:""}
    ${d?`<dt>Fuso horário</dt><dd>${esc(d.timezone)}</dd>`:""}
    ${l.gps?`<dt>Precisão do GPS</dt><dd>±${l.acc} m</dd>`:""}</dl>`;
  $("#about").innerHTML = facts;
  // Wikipédia (resumo do município)
  const tries = [l.name, l.state && `${l.name} (${l.state})`, l.uf && `${l.name} (${l.uf})`].filter(Boolean);
  for(const t of tries){
    try{ const w = await getData(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g,"_"))}`);
      if(!w || w.type==="disambiguation" || !w.extract) continue;
      $("#about").innerHTML = `<div class="wiki">${w.thumbnail?`<img src="${esc(w.thumbnail.source)}" alt="${esc(w.title)}" loading="lazy">`:""}<div><p>${esc(w.extract)}</p><p style="margin-top:6px"><a href="${esc(w.content_urls.desktop.page)}" target="_blank" rel="noopener">Ler mais na Wikipédia ↗</a></p></div></div>${facts}`;
      $("#wikiSrc").textContent = "Wikipédia · IBGE";
      state.aboutHTML = $("#about").innerHTML; state.wikiSrc = "Wikipédia · IBGE"; return;
    }catch(e){}
  }
  $("#wikiSrc").textContent = "IBGE · Open-Meteo";
  state.aboutHTML = $("#about").innerHTML; state.wikiSrc = "IBGE · Open-Meteo";
}
function renderLinks(){
  const l=state.loc, uf=(l.uf||"").toLowerCase(), q=encodeURIComponent(`Defesa Civil ${l.state||""}`);
  const L=[
    ["INMET · Avisos meteorológicos","Mapa oficial de avisos do Brasil","https://alertas2.inmet.gov.br/"],
    ["INMET · Previsão oficial","Instituto Nacional de Meteorologia","https://portal.inmet.gov.br/"],
    ["Defesa Civil Nacional","Alertas e orientações (MIDR)","https://www.gov.br/mdr/pt-br/assuntos/protecao-e-defesa-civil"],
    [`Defesa Civil ${l.state||"do estado"}`,"Buscar o site estadual oficial",`https://www.google.com/search?q=${q}+site%3Agov.br`],
    ["CEMADEN","Monitoramento de desastres naturais","https://www.gov.br/cemaden/pt-br"],
    ["CPTEC/INPE","Previsão numérica e satélite","https://www.cptec.inpe.br/"],
  ];
  $("#links").innerHTML = L.map(([t,s,u])=>`<a href="${u}" target="_blank" rel="noopener"><b>${esc(t)} ↗</b><small>${esc(s)}</small></a>`).join("");
  $("#smsBox").innerHTML = `<span>Receba alertas da Defesa Civil por SMS: envie o seu CEP para <code>40199</code>.</span><button class="btn" id="copySms">Copiar número</button>`;
  $("#copySms").onclick = async ()=>{ try{ await navigator.clipboard.writeText("40199"); toast("Número 40199 copiado."); }catch(e){ toast("Número: 40199"); } };
}

/* =============== MAPA: previsão em grade, radar, satélite, vento e avisos =============== */
const MAP = {mode:"prev", grid:null, cells:null, winds:null, idx:0, timer:null, sat:null, satLvl:0, base:null, ref:null};
const PCOL = [[0.1,"#9be7ff"],[0.5,"#4fb8ff"],[1.5,"#2f7bff"],[3,"#2ecc71"],[6,"#f5d020"],[10,"#ff9340"],[20,"#ff4d5e"],[40,"#b36bff"]];
const pcol = mm => { let c=null; for(const [v,col] of PCOL) if(mm>=v) c=col; return c; };
function setBase(){
  if(!state.map) return;
  const light = document.documentElement.dataset.theme==="light";
  if(MAP.base) state.map.removeLayer(MAP.base); if(MAP.ref){ state.map.removeLayer(MAP.ref); MAP.ref = null; }
  MAP.base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:16, className: light ? "base-light" : "base-dark",
    attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · RainViewer · NASA GIBS · Open-Meteo'}).addTo(state.map);
  MAP.base.bringToBack();
}
function ensureMap(){
  if(state.map || !state.loc) return;
  if(typeof L==="undefined"){ $("#map").innerHTML=`<p class="muted" style="padding:16px">Mapa indisponível sem internet.</p>`; return; }
  $("#map").style.height = $("#map").style.height || "";
  state.map = L.map("map",{zoomControl:true}).setView([state.loc.lat,state.loc.lon],8);
  setBase();
  state.marker = L.marker([state.loc.lat,state.loc.lon],{zIndexOffset:1000,icon:L.divIcon({className:"",html:'<div class="me-dot"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(state.map);
  loadRadar(); loadGrid(); drawAlertAreas(); setMapMode(MAP.mode);
}
function updateMap(){ state.map.setView([state.loc.lat,state.loc.lon], Math.max(6,Math.min(state.map.getZoom(),9))); state.marker.setLatLng([state.loc.lat,state.loc.lon]); loadRadar(); loadGrid(); }

/* previsão de chuva e vento em grade (9 x 9 pontos, ~200 km) */
async function loadGrid(){
  if(!state.map) return;
  const N=9, step=0.25, lat = rc(state.loc.lat), lon = rc(state.loc.lon), pts=[];
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) pts.push({la:+(lat+(r-(N-1)/2)*step).toFixed(3), lo:+(lon+(c-(N-1)/2)*step).toFixed(3), r, c});
  try{
    const j = await getData(`https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p=>p.la).join(",")}&longitude=${pts.map(p=>p.lo).join(",")}&hourly=precipitation,wind_speed_10m,wind_direction_10m&forecast_hours=25&timezone=auto`, {timeout:25000});
    const arr = Array.isArray(j) ? j : [j];
    MAP.grid = {pts, step, times: arr[0].hourly.time, hr: arr.map(x=>x.hourly)};
    if(MAP.cells) state.map.removeLayer(MAP.cells); if(MAP.winds) state.map.removeLayer(MAP.winds);
    MAP.cells = L.layerGroup(pts.map(p=>L.rectangle([[p.la-step/2,p.lo-step/2],[p.la+step/2,p.lo+step/2]],{stroke:false,fillOpacity:0,interactive:false}))).addTo(state.map);
    MAP.winds = L.layerGroup(pts.map((p,k)=>({p,k})).filter(({p})=>p.r%2===0 && p.c%2===0).map(({p,k})=>{ const m = L.marker([p.la,p.lo],{interactive:false,icon:L.divIcon({className:"",html:"",iconSize:[22,22],iconAnchor:[11,11]})}); m._k=k; return m; }));
    if($("#lyrWind").checked) MAP.winds.addTo(state.map);
    if(MAP.mode==="prev"){ MAP.idx = 0; setMapMode("prev"); } else renderMapFrame();
  }catch(e){ if(MAP.mode==="prev") $("#radarTime").textContent = "Previsão indisponível"; }
}
function renderWinds(hIdx){
  if(!MAP.winds || !MAP.grid) return;
  MAP.winds.eachLayer(m=>{ const h = MAP.grid.hr[m._k]; const sp = h.wind_speed_10m[hIdx], dir = h.wind_direction_10m[hIdx];
    m.setIcon(L.divIcon({className:"",iconSize:[22,22],iconAnchor:[11,11],html:`<div class="wind-ar" style="transform:rotate(${dir+180}deg)"><svg viewBox="0 0 12 12"><path d="M6 1l3.5 9L6 8 2.5 10z" fill="currentColor"/></svg></div><span class="wind-ar" style="position:absolute;top:0;left:0"><span>${r0(sp)}</span></span>`})); });
}
function renderMapFrame(){
  const R = state.radar, G = MAP.grid;
  if(MAP.mode==="prev"){
    if(R) R.layers.forEach(l=>l.setOpacity(0));
    if(!G) return;
    const i = Math.min(MAP.idx, G.times.length-1);
    let k=0; MAP.cells.eachLayer(rc=>{ const mm = G.hr[k++].precipitation[i]||0, col = pcol(mm); rc.setStyle({fillColor:col||"#000", fillOpacity: col ? .5 : 0}); });
    renderWinds(i);
    $("#radarTime").textContent = whenTxt(G.times[i]);
  } else {
    if(MAP.cells) MAP.cells.eachLayer(rc=>rc.setStyle({fillOpacity:0}));
    if(G) renderWinds(0);
    if(!R || !R.frames.length){ $("#radarTime").textContent = "Radar indisponível"; return; }
    const n = Math.min(MAP.idx, R.frames.length-1);
    R.layers.forEach((l,i)=>l.setOpacity(i===n?.8:0));
    const f = R.frames[n], t = new Date(f.time*1000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    $("#radarTime").textContent = t + (f.nowcast ? " · previsão" : n===R.pastCount-1 ? " · último" : "");
  }
  $("#radarSlider").value = MAP.idx;
}
function mapLegend(){
  const el = $("#mapLegend");
  if(MAP.mode==="prev") el.innerHTML = `<b>Chuva mm/h</b>` + [[0.1,"fraca"],[1.5,""],[6,"forte"],[20,""],[40,"extrema"]].map(([v,l])=>`<span><i style="background:${pcol(v)}"></i>${l||v}</span>`).join("");
  else el.innerHTML = `<b>Radar</b><span><i style="background:#88ddee"></i>fraca</span><span><i style="background:#0099cc"></i></span><span><i style="background:#ffee00"></i></span><span><i style="background:#ff4400"></i>forte</span>`;
}
function setMapMode(m){
  MAP.mode = m; stopMapAnim();
  $$(".mapmode button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.mode===m));
  if(m==="prev"){ const G = MAP.grid; $("#radarSlider").max = G ? G.times.length-1 : 0; MAP.idx = 0; }
  else { const R = state.radar; $("#radarSlider").max = R ? Math.max(0,R.frames.length-1) : 0; MAP.idx = R ? Math.max(0,R.pastCount-1) : 0; }
  mapLegend(); renderMapFrame();
}
$$(".mapmode button").forEach(b=>b.addEventListener("click", ()=>setMapMode(b.dataset.mode)));
async function loadRadar(){
  try{ const j = await getData("https://api.rainviewer.com/public/weather-maps.json");
    const past = (j.radar&&j.radar.past)||[], now = ((j.radar&&j.radar.nowcast)||[]).map(f=>({...f,nowcast:true})), fr = past.concat(now);
    if(state.radar) state.radar.layers.forEach(l=>state.map.removeLayer(l));
    state.radar = {frames:fr, pastCount:past.length, layers:fr.map(f=>L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:0,maxNativeZoom:7,maxZoom:16,zIndex:10}))};
    state.radar.layers.forEach(l=>l.addTo(state.map));
    if(MAP.mode==="radar") setMapMode("radar"); else renderMapFrame();
  }catch(e){ if(MAP.mode==="radar") $("#radarTime").textContent="Radar indisponível"; }
}
function stopMapAnim(){ clearInterval(MAP.timer); MAP.timer=null; $("#radarPlay").textContent="▶"; $("#radarPlay").setAttribute("aria-label","Animar"); }
$("#radarSlider").addEventListener("input", e=>{ MAP.idx = +e.target.value; renderMapFrame(); });
$("#radarPlay").addEventListener("click", ()=>{
  if(MAP.timer){ stopMapAnim(); return; }
  const max = +$("#radarSlider").max; if(!max) return;
  $("#radarPlay").textContent="❚❚"; $("#radarPlay").setAttribute("aria-label","Pausar");
  MAP.timer = setInterval(()=>{ MAP.idx = (MAP.idx+1) % (max+1); renderMapFrame(); }, MAP.mode==="prev" ? 700 : 600);
});
/* satélite de nuvens (NASA GIBS, GOES-East infravermelho) */
const SAT_LVLS = [6,7,5];
function satLayer(){
  const lvl = SAT_LVLS[MAP.satLvl];
  const l = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.png`,{maxNativeZoom:lvl,maxZoom:16,opacity:.65,zIndex:5});
  let errs = 0; l.on("tileerror", ()=>{ if(++errs===4 && MAP.satLvl < SAT_LVLS.length-1){ MAP.satLvl++; state.map.removeLayer(l); MAP.sat = satLayer().addTo(state.map); } });
  return l;
}
$("#lyrSat").addEventListener("change", e=>{ if(!state.map) return; if(e.target.checked){ MAP.sat = satLayer().addTo(state.map); } else if(MAP.sat){ state.map.removeLayer(MAP.sat); MAP.sat=null; } });
$("#lyrWind").addEventListener("change", e=>{ if(!state.map || !MAP.winds) return; e.target.checked ? MAP.winds.addTo(state.map) : state.map.removeLayer(MAP.winds); });
function drawAlertAreas(){
  if(!state.map) return;
  if(state.alertLayer) state.map.removeLayer(state.alertLayer);
  const feats = (state.inmetAll||[]).filter(a=>a.geo).map(a=>({type:"Feature",geometry:a.geo,properties:a}));
  state.alertLayer = L.geoJSON({type:"FeatureCollection",features:feats},{
    style:f=>({color:CV(SEV_COLOR[f.properties.sev].replace(/var\(|\)/g,"")),weight:1.5,fillOpacity:.12}),
    onEachFeature:(f,l)=>l.bindPopup(`<b>${esc(f.properties.title)}</b><br>${esc(f.properties.sevTxt)}<br>${f.properties.end?"até "+fmtDT(f.properties.end):""}`)
  });
  if($("#lyrAlerts").checked) state.alertLayer.addTo(state.map);
}
$("#lyrAlerts").addEventListener("change",e=>{ if(!state.alertLayer) return; e.target.checked?state.alertLayer.addTo(state.map):state.map.removeLayer(state.alertLayer); });
/* tela cheia */
function mapFull(on){
  const w = $("#mapWrap");
  if(on===w.classList.contains("full")) return;
  w.classList.toggle("full", on); document.body.classList.toggle("lock", on); $("#mapClose").hidden = !on;
  setTimeout(()=>state.map && state.map.invalidateSize(), 60);
  if(on) pushOverlay("map", ()=>mapFull(false)); else popOverlay("map");
}
$("#mapFull").addEventListener("click", ()=>{ ensureMap(); mapFull(true); });
$("#mapClose").addEventListener("click", ()=>mapFull(false));

/* =============== AJUSTES E TEMA =============== */
const settings = Object.assign({theme:"auto", fx:true}, store.get("wx_settings")||{});
const mqLight = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
function applyTheme(){
  const t = settings.theme==="auto" ? (mqLight && mqLight.matches ? "light" : "dark") : settings.theme;
  document.documentElement.dataset.theme = t; setBase();
  if(state.data){ renderWeather(); if(state.view==="graficos"){ renderChart(); renderModels(); } }
}
if(mqLight && mqLight.addEventListener) mqLight.addEventListener("change", ()=>{ if(settings.theme==="auto") applyTheme(); });
function saveSettings(){ store.set("wx_settings", settings); }

/* =============== FOLHA INFERIOR (detalhes e ajustes) =============== */
let sheetReturn = null;
function openSheet(html){
  sheetReturn = document.activeElement;
  const was = $("#sheetBg").hidden;
  $("#sheetBody").innerHTML = html; $("#sheetBg").hidden = false;
  if(was) pushOverlay("sheet", fb=>closeSheet(fb));
  setTimeout(()=>$("#sheetX").focus(), 30);
}
function closeSheet(fromBack){ if($("#sheetBg").hidden) return; $("#sheetBg").hidden = true; if(!fromBack) popOverlay("sheet"); if(sheetReturn && sheetReturn.focus) sheetReturn.focus(); }
$("#sheetX").addEventListener("click", ()=>closeSheet());
$("#sheetBg").addEventListener("click", e=>{ if(e.target.id==="sheetBg") closeSheet(); });
document.addEventListener("keydown", e=>{ if(e.key!=="Escape") return; if(!$("#sheetBg").hidden) closeSheet(); else if(!$("#reader").hidden) closeArticle(); else if(!$("#chat").hidden) closeChat(); else if($("#mapWrap").classList.contains("full")) mapFull(false); });

function openSettings(){
  const segBtn = (v,l) => `<button data-theme-set="${v}" aria-pressed="${settings.theme===v}">${l}</button>`;
  openSheet(`<h3 id="sheetTitle">Ajustes</h3><p class="sub">Tempo Agora PWSIS</p>
    <div class="setgroup"><span class="label">Aparência</span><div class="seg">${segBtn("auto","Automático")}${segBtn("light","Claro")}${segBtn("dark","Escuro")}</div>
      <small class="muted">Automático segue o tema do celular. O claro é melhor para ler no sol.</small></div>
    <div class="setting" style="border-bottom:0"><b>Fundo animado</b><label class="switch"><input type="checkbox" id="optFx" ${settings.fx?"checked":""} aria-label="Fundo animado"><span></span></label><small>Mostra chuva, neve, estrelas ou relâmpagos no fundo, conforme o tempo.</small></div>
    <div class="setgroup"><span class="label">Voz do assistente</span>
      <select id="setVoice" style="padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--fg)"><option value="">Melhor voz do Brasil (automático)</option></select>
      <label style="display:grid;gap:4px;font-size:13.5px">Velocidade da fala <input type="range" id="setRate" min="0.8" max="1.3" step="0.05" value="${voiceCfg.rate}"></label>
      <button class="btn ghost" id="setVoiceTest" type="button">Testar a voz</button>
      <small class="muted">As vozes vêm do próprio celular. Para uma voz mais natural, instale ou atualize os "Serviços de fala do Google" na Play Store e baixe a voz Português (Brasil) em alta qualidade.</small></div>
    <div class="setgroup"><span class="label">Microfone</span>
      <div class="seg" style="grid-template-columns:1fr 1fr">${["auto","local"].map(m=>`<button data-mic="${m}" aria-pressed="${(store.get("wx_micmode")||"auto")===m}">${m==="auto"?"Automático":"No próprio celular"}</button>`).join("")}</div>
      <small class="muted">Automático usa o reconhecimento do navegador quando ele existe. "No próprio celular" funciona em qualquer navegador e sem enviar sua voz para fora; na primeira vez baixa cerca de 80 MB.</small></div>
    <div class="setgroup"><span class="label">Privacidade e licenças</span>
      <button class="btn ghost" id="setPriv" type="button">Como o app trata seus dados</button>
      <button class="btn ghost" id="setLic" type="button">Licenças e créditos</button></div>
    <div class="setgroup"><span class="label">Mais</span>
      <button class="btn ghost" id="setNotif">Notificações e instalação</button>
      <button class="btn ghost" id="setShare">Enviar o app para alguém</button></div>
    <p class="sub" style="margin-top:14px">Versão 2026.09.29 · Dados: Open-Meteo, INMET, Defesa Civil, RainViewer, IBGE.</p>`);
  $$("[data-theme-set]").forEach(b=>b.onclick=()=>{ settings.theme=b.dataset.themeSet; saveSettings(); applyTheme(); $$("[data-theme-set]").forEach(x=>x.setAttribute("aria-pressed", x===b)); });
  $("#optFx").onchange = e=>{ settings.fx = e.target.checked; saveSettings(); setFx(); };
  getVoices().then(vs=>{ const sel = $("#setVoice"); if(!sel) return; vs.filter(v=>voiceScore(v)>-99).sort((x,y)=>voiceScore(y)-voiceScore(x)).forEach(v=>{ const o = document.createElement("option"); o.value = v.name; o.textContent = `${v.name} (${v.lang})`; if(v.name===voiceCfg.name) o.selected = true; sel.appendChild(o); });
    if(sel.options.length===1) sel.insertAdjacentHTML("afterend", `<small class="muted">Nenhuma voz em português encontrada neste aparelho.</small>`); });
  $("#setVoice").onchange = e=>{ voiceCfg.name = e.target.value; store.set("wx_voicecfg", voiceCfg); speak("Olá! Esta é a voz do Tempo Agora PWSIS."); };
  $("#setRate").oninput = e=>{ voiceCfg.rate = +e.target.value; store.set("wx_voicecfg", voiceCfg); };
  $("#setVoiceTest").onclick = ()=>speak("Olá! Amanhã deve chover entre 14h e 18h, com rajadas de vento de 40 km/h vindo de NE. Mínima de -1°C na quinta (1/10)." );
  $$("[data-mic]").forEach(b=>b.onclick=()=>{ store.set("wx_micmode", b.dataset.mic); $$("[data-mic]").forEach(x=>x.setAttribute("aria-pressed", x===b)); if(b.dataset.mic==="local") loadWhisper(); });
  $("#setNotif").onclick = ()=>{ closeSheet(); showView("agora"); setTimeout(()=>$("#notifPanel").scrollIntoView({behavior:"smooth"}),80); };
  $("#setShare").onclick = ()=>{ closeSheet(); shareApp(); };
  $("#setPriv").onclick = ()=>openSheet(`<h3 id="sheetTitle">Seus dados</h3><p class="sub">Tempo Agora PWSIS</p>
    <p><b>Nada de cadastro.</b> O app não pede nome, telefone ou e-mail e não tem rastreadores, cookies ou contadores de visita.</p>
    <p><b>Fica só no seu celular:</b> favoritos, ajustes, conversas com o assistente e a última previsão.</p>
    <p><b>Localização:</b> para buscar a previsão, o app envia uma posição <b>arredondada (cerca de 1 km)</b> ao serviço de tempo. Os alertas do INMET e da Defesa Civil são conferidos no próprio celular, sem enviar onde você está.</p>
    <p><b>Microfone:</b> só liga quando você toca no botão e desliga sozinho. No modo "No próprio celular" a sua voz não sai do aparelho; no modo automático do Chrome, a voz é transcrita pelo serviço do Google.</p>
    <p><b>Código:</b> todo o código e as bibliotecas ficam dentro do próprio app, e uma regra de segurança impede o carregamento de código de qualquer outro site.</p>`);
  $("#setLic").onclick = ()=>openSheet(`<h3 id="sheetTitle">Licenças e créditos</h3><p class="sub">Componentes livres usados no app</p>
    <div class="help-scale">${[["Chart.js 4.4.1","MIT"],["Leaflet 1.9.4","BSD-2-Clause"],["Readability 0.6.0 (Mozilla)","Apache-2.0"],["Transformers.js 3.8.1 (Hugging Face)","Apache-2.0"],["ONNX Runtime Web (Microsoft)","MIT"],["Whisper (OpenAI), modelo de voz","MIT"],["Fontes Barlow Condensed, Figtree, IBM Plex Mono","OFL-1.1"]].map(([n,l])=>`<div><i style="background:var(--accent)"></i><span>${n}</span><b>${l}</b></div>`).join("")}</div>
    <p style="margin-top:12px"><b>Dados:</b> Weather data by Open-Meteo.com (CC BY 4.0) · Avisos: INMET e Defesa Civil (IDAP/MIDR) · Radar: RainViewer · Satélite: NASA GIBS · Mapa: © colaboradores do OpenStreetMap · Municípios: IBGE · Textos de local: Wikipédia (CC BY-SA) · Notícias: MetSul, Canal Rural, Agência Brasil.</p>
    <p><a href="vendor/LICENCAS-TERCEIROS.txt" target="_blank" rel="noopener">Ver o texto completo das licenças</a></p>`);
}
$("#btnSettings").addEventListener("click", openSettings);

/* =============== DETALHE DE UMA HORA =============== */
function openHour(i){
  const h = state.data.hourly, t = h.time[i], wc = h.weather_code[i];
  const vis = h.visibility[i];
  openSheet(`<div class="hourhead">${icon(wc,h.is_day[i],{gust:h.wind_gusts_10m[i],cloud:h.cloud_cover[i]})}<div><h3 id="sheetTitle">${whenTxt(t).replace(/^./,c=>c.toUpperCase())}</h3><div class="sub">${wmo(wc)[0]}</div></div><span class="big num" style="margin-left:auto">${r0(h.temperature_2m[i])}°</span></div>
    <div class="metrics">
      <div class="metric"><span class="label">Sensação</span><span class="v num">${r0(h.apparent_temperature[i])}°</span><span class="d">Orvalho ${r0(h.dew_point_2m[i])}°</span></div>
      <div class="metric"><span class="label">Chuva</span><span class="v num">${r1(h.precipitation[i])}<small>mm</small></span><span class="d">Chance ${r0(h.precipitation_probability[i])}%</span></div>
      <div class="metric"><span class="label">Vento</span><span class="v num">${r0(h.wind_speed_10m[i])}<small>km/h</small></span><span class="d">De ${dirTxt(h.wind_direction_10m[i])} · rajada ${r0(h.wind_gusts_10m[i])}</span></div>
      <div class="metric"><span class="label">Umidade</span><span class="v num">${r0(h.relative_humidity_2m[i])}<small>%</small></span><span class="d">Nuvens ${r0(h.cloud_cover[i])}%</span></div>
      <div class="metric"><span class="label">Pressão</span><span class="v num">${r0(h.pressure_msl[i])}<small>hPa</small></span><span class="d">Visib. ${vis>=10000?r0(vis/1000):r1(vis/1000)} km</span></div>
      <div class="metric"><span class="label">Índice UV</span><span class="v num">${r1(h.uv_index[i])}</span><span class="d">CAPE ${r0(h.cape[i])} J/kg</span></div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:space-between">
      <button class="btn ghost" id="hPrev" ${i<=nowIndex()?"disabled":""}>← Hora anterior</button>
      <button class="btn ghost" id="hNext" ${i>=h.time.length-1?"disabled":""}>Próxima hora →</button>
    </div>`);
  $("#hPrev").onclick = ()=>openHour(i-1); $("#hNext").onclick = ()=>openHour(i+1);
}
$("#timeline").addEventListener("click", e=>{ const el = e.target.closest(".hour"); if(el && state.data) openHour(+el.dataset.i); });
$("#timeline").addEventListener("keydown", e=>{ if((e.key==="Enter"||e.key===" ") && e.target.classList.contains("hour")){ e.preventDefault(); openHour(+e.target.dataset.i); } });

/* =============== CHUVA NAS PRÓXIMAS 2 HORAS =============== */
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
function renderNowcast(){
  const d = state.data; if(!d) return;
  const now = parseLocal(d.current.time); let slots = [];
  const m = d.minutely_15;
  if(m && m.time && m.precipitation){
    for(let i=0;i<m.time.length && slots.length<8;i++){ const t = parseLocal(m.time[i]); if(t.getTime() >= now.getTime()-14*60000) slots.push({t:m.time[i], mm:m.precipitation[i]||0}); }
  }
  if(slots.length < 8){                                    // sem dados de 15 min: divide a previsão por hora
    const h = d.hourly, i0 = nowIndex(); slots = [];
    for(let k=0;k<2;k++){ const base = parseLocal(h.time[i0+k]||h.time[i0]); const mm=(h.precipitation[i0+k]||0)/4;
      for(let q=0;q<4;q++){ const t = new Date(base.getTime()+q*15*60000); slots.push({t:isoLocal(t), mm}); } }
  }
  const wet = x => x.mm >= 0.05, max = Math.max(0.5, ...slots.map(x=>x.mm));
  const kind = mm => mm < 0.3 ? "fraca" : mm < 1.5 ? "moderada" : "forte";
  let line;
  if(wet(slots[0])){
    const stop = slots.findIndex(x=>!wet(x));
    line = stop<0 ? `Chuva ${kind(Math.max(...slots.map(x=>x.mm)))} continua pelas próximas 2 horas.` : `Chuva ${kind(slots[0].mm)} agora, deve parar por volta das ${hhmm(slots[stop].t)}.`;
  } else {
    const st = slots.findIndex(wet);
    line = st<0 ? "Sem chuva prevista nas próximas 2 horas." : `Chuva ${kind(Math.max(...slots.slice(st).map(x=>x.mm)))} deve começar por volta das ${hhmm(slots[st].t)}.`;
  }
  $("#ncLine").textContent = line;
  $("#ncBars").innerHTML = slots.map(x=>`<i class="${wet(x)?"":"dry"}" style="height:${wet(x)?Math.max(8,x.mm/max*100):4}%" title="${hhmm(x.t)} · ${r1(x.mm)} mm"></i>`).join("");
  $("#ncAxis").innerHTML = slots.map((x,i)=>`<span>${i===0?"agora":hhmm(x.t)}</span>`).join("");
}

/* =============== RESUMO DO DIA EM UMA FRASE =============== */
function renderDaySum(){
  const d = state.data; if(!d) return;
  const h = d.hourly, dd = d.daily, i0 = nowIndex(), today = d.current.time.slice(0,10);
  const parts = [];
  const hrs = []; for(let i=i0;i<h.time.length && h.time[i].slice(0,10)===today;i++) hrs.push(i);
  const nowH = +d.current.time.slice(11,13);
  parts.push(`<b>${nowH>=18 ? "Esta noite" : "Hoje"}:</b> ${wmo(dd.weather_code[0])[0].toLowerCase()}, máxima de ${r0(dd.temperature_2m_max[0])}° e mínima de ${r0(dd.temperature_2m_min[0])}°.`);
  let best=null, cur=null;
  hrs.forEach(i=>{ if(h.precipitation_probability[i]>=40){ cur = cur ? {...cur,e:i,p:Math.max(cur.p,h.precipitation_probability[i])} : {s:i,e:i,p:h.precipitation_probability[i]}; if(!best || cur.p>best.p || (cur.p===best.p && cur.e-cur.s>best.e-best.s)) best={...cur}; } else cur=null; });
  if(best) parts.push(best.s===best.e ? `Chuva mais provável por volta das ${+h.time[best.s].slice(11,13)}h (${best.p}%).` : `Chuva mais provável entre ${+h.time[best.s].slice(11,13)}h e ${+h.time[best.e].slice(11,13)+1}h (${best.p}%).`);
  else if(hrs.length) parts.push("Sem chuva prevista até o fim do dia.");
  const gmax = hrs.length ? Math.max(...hrs.map(i=>h.wind_gusts_10m[i])) : 0;
  if(gmax>=50) parts.push(`Rajadas de até ${r0(gmax)} km/h.`);
  if(hrs.some(i=>h.weather_code[i]>=95)) parts.push("Atenção para trovoadas.");
  if(dd.time[1]){
    const dif = dd.temperature_2m_max[1]-dd.temperature_2m_max[0], p1 = dd.precipitation_probability_max[1];
    const t = dif>=3 ? `esquenta (máxima de ${r0(dd.temperature_2m_max[1])}°)` : dif<=-3 ? `esfria (máxima de ${r0(dd.temperature_2m_max[1])}°)` : `temperatura parecida`;
    parts.push(`<b>Amanhã</b> ${t}${p1>=60?`, com chuva (${p1}%)`:p1>=30?`, possibilidade de chuva (${p1}%)`:", sem chuva"}.`);
  }
  $("#daySum").innerHTML = parts.join(" ");
}

/* =============== FAVORITOS =============== */
let favs = store.get("wx_favs") || [];
const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8"/></svg>';
const favIndexHere = () => state.loc ? favs.findIndex(f=>distKm(f,state.loc)<1) : -1;
function renderFavs(){
  const box = $("#favs"), here = favIndexHere(), gpsOn = state.loc && state.loc.gps;
  box.innerHTML = `<button class="fchip ${gpsOn?"on":""}" data-gps="1">${PIN}Minha localização</button>` +
    favs.map((f,i)=>`<button class="fchip ${!gpsOn && i===here?"on":""}" data-i="${i}">${esc(f.name)}</button>`).join("");
  box.hidden = !favs.length && gpsOn;
  const st = $("#btnFav"); st.setAttribute("aria-pressed", here>=0);
  const lbl = here>=0 ? "Remover dos favoritos" : "Salvar nos favoritos"; st.title = lbl; st.setAttribute("aria-label", lbl);
  $("#starPath").setAttribute("fill", here>=0 ? "currentColor" : "none");
}
$("#favs").addEventListener("click", e=>{
  const b = e.target.closest(".fchip"); if(!b) return;
  if(b.dataset.gps){ getGps(true); return; }
  const f = favs[+b.dataset.i]; if(!f) return;
  $("#btnGps").classList.remove("on");
  setLocation({...f});
});
$("#btnFav").addEventListener("click", ()=>{
  if(!state.loc) return; const i = favIndexHere();
  if(i>=0){ favs.splice(i,1); toast(`${state.loc.name} removido dos favoritos.`); }
  else { const {lat,lon,name,district,state:st,uf,country,cc,ibge,micro} = state.loc;
    favs.unshift({lat,lon,name,district,state:st,uf,country,cc,ibge,micro}); favs = favs.slice(0,10);
    toast(`${name} salvo. Toque no nome acima para voltar a ele.`); }
  store.set("wx_favs", favs); renderFavs();
});

/* =============== PUXAR PARA ATUALIZAR =============== */
(()=>{
  let y0=null, dy=0; const ptr=$("#ptr");
  addEventListener("touchstart", e=>{ if(scrollY<=0 && $("#sheetBg").hidden && !e.target.closest(".timeline,.spray,#map,.tabs,.cscroll,.favs,.results")){ y0=e.touches[0].clientY; dy=0; } }, {passive:true});
  addEventListener("touchmove", e=>{ if(y0==null) return; dy=e.touches[0].clientY-y0; if(dy>0 && scrollY<=0){ const d=Math.min(dy*.5,90); ptr.style.transform=`translate(-50%,${d}px)`; ptr.style.opacity=Math.min(1,d/50); ptr.textContent = d>=60 ? "Solte para atualizar" : "Puxe para atualizar"; } }, {passive:true});
  addEventListener("touchend", ()=>{ if(y0==null) return; const d=Math.min(dy*.5,90); y0=null; ptr.style.transform=""; ptr.style.opacity=0;
    if(d>=60){ if(state.view==="noticias") loadNews(true); else refreshIfStale(true); toast("Atualizando…"); try{ navigator.vibrate && navigator.vibrate(12); }catch(e){} } });
})();

/* =============== AVISO DE NOVA VERSÃO =============== */
const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
function watchUpdates(reg){
  if(!reg) return;
  reg.addEventListener("updatefound", ()=>{ const w = reg.installing; if(!w) return;
    w.addEventListener("statechange", ()=>{ if(w.state==="activated" && hadController) $("#updBar").hidden = false; }); });
  const check = ()=>reg.update().catch(()=>{});
  setInterval(check, 30*60*1000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) check(); });
}
$("#updBtn").addEventListener("click", ()=>location.reload());

/* =============== FUNDO ANIMADO =============== */
const fx = {c:$("#fx"), x:null, parts:[], kind:"none", raf:0, flash:0, last:0};
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function setFx(){
  cancelAnimationFrame(fx.raf);
  const c = state.data && state.data.current;
  let kind = "none";
  if(c && settings.fx && !reduceMotion){
    const code = c.weather_code;
    if(code>=95) kind="storm"; else if([71,73,75,77,85,86].includes(code)) kind="snow";
    else if(code>=51 && code<=82) kind = (code===65||code===82) ? "heavy" : "rain";
    else if(!c.is_day && code<=2) kind="stars";
  }
  fx.kind = kind;
  const ctx = fx.c.getContext("2d"); fx.x = ctx;
  const dpr = Math.min(1.5, devicePixelRatio||1);
  fx.c.width = innerWidth*dpr; fx.c.height = innerHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,innerWidth,innerHeight);
  if(kind==="none") return;
  const n = {rain:90, heavy:170, storm:130, snow:70, stars:90}[kind];
  fx.parts = Array.from({length:n}, ()=>({x:Math.random()*innerWidth, y:Math.random()*innerHeight, v:.6+Math.random()*.8, r:Math.random()}));
  fx.raf = requestAnimationFrame(fxLoop);
}
function fxLoop(ts){
  fx.raf = requestAnimationFrame(fxLoop);
  if(document.hidden || ts-fx.last < 30) return; fx.last = ts;
  const x = fx.x, W = innerWidth, H = innerHeight, k = fx.kind; x.clearRect(0,0,W,H);
  if(k==="stars"){ x.fillStyle = "#e3eaf7";
    fx.parts.forEach(p=>{ if(p.y>H*.6) return; x.globalAlpha = .25+.5*Math.abs(Math.sin(ts/1400+p.r*9)); x.fillRect(p.x,p.y*.6,1.4,1.4); }); x.globalAlpha=1; return; }
  if(k==="snow"){ x.fillStyle = "rgba(255,255,255,.75)";
    fx.parts.forEach(p=>{ p.y += p.v*1.2; p.x += Math.sin(ts/900+p.r*6)*.5; if(p.y>H){p.y=-4;p.x=Math.random()*W;} x.beginPath(); x.arc(p.x,p.y,1.2+p.r*1.8,0,6.3); x.fill(); }); return; }
  x.strokeStyle = CV("--rain"); x.lineWidth = 1.2; x.beginPath();
  const sp = k==="heavy" ? 14 : 10;
  fx.parts.forEach(p=>{ p.y += p.v*sp; p.x -= p.v*1.5; if(p.y>H){ p.y=-20; p.x=Math.random()*(W+60); } x.moveTo(p.x,p.y); x.lineTo(p.x+2,p.y-12-p.r*8); });
  x.stroke();
  if(k==="storm"){ if(fx.flash<=0 && Math.random()<.004) fx.flash = 8; if(fx.flash>0){ x.fillStyle = `rgba(230,235,255,${fx.flash*.03})`; x.fillRect(0,0,W,H); fx.flash--; } }
}
addEventListener("resize", ()=>{ clearTimeout(fx.rt); fx.rt = setTimeout(setFx, 200); });

/* =============== COMPARTILHAR COMO IMAGEM =============== */
function svgImg(svg, size){ return new Promise(res=>{ const im = new Image(); im.onload=()=>res(im); im.onerror=()=>res(null);
  im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace('class="ic"',`width="${size}" height="${size}"`)); }); }
async function shareImage(){
  if(!state.data){ toast("Aguarde a previsão carregar."); return; }
  toast("Montando a imagem…");
  try{ await document.fonts.ready; }catch(e){}
  const d = state.data, c = d.current, dd = d.daily, h = d.hourly, i0 = nowIndex();
  const W=1080, H=1350, cv=document.createElement("canvas"); cv.width=W; cv.height=H; const x=cv.getContext("2d");
  const g = x.createLinearGradient(0,0,0,H); g.addColorStop(0, c.is_day?"#2d74c4":"#1c2c5a"); g.addColorStop(.55,"#0f1f3a"); g.addColorStop(1,"#0b1426");
  x.fillStyle=g; x.fillRect(0,0,W,H);
  const F = (w,s,f="Figtree") => `${w} ${s}px "${f}", system-ui, sans-serif`;
  x.fillStyle="#93a3c0"; x.font=F(700,30,"Barlow Condensed"); x.fillText("TEMPO AGORA", 70, 96);
  x.fillStyle="#62ccff"; x.fillText("PWSIS", 70 + x.measureText("TEMPO AGORA ").width + 6, 96);
  x.fillStyle="#eaf0fa"; x.font=F(700,68); x.fillText(state.loc.name||"", 70, 180);
  x.fillStyle="#93a3c0"; x.font=F(500,32); x.fillText(new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}) + " · " + hhmm(c.time), 70, 230);
  x.fillStyle="#eaf0fa"; x.font=F(600,250,"Barlow Condensed"); x.fillText(`${r0(c.temperature_2m)}°`, 60, 480);
  const big = await svgImg(icon(c.weather_code,c.is_day,{gust:c.wind_gusts_10m,cloud:c.cloud_cover,forDark:1}), 300); if(big) x.drawImage(big, 690, 220, 300, 300);
  x.font=F(700,46); x.fillText(wmo(c.weather_code)[0], 70, 560);
  x.fillStyle="#93a3c0"; x.font=F(500,34); x.fillText(`Sensação ${r0(c.apparent_temperature)}° · ↑${r0(dd.temperature_2m_max[0])}° ↓${r0(dd.temperature_2m_min[0])}° · chuva ${r0(dd.precipitation_probability_max[0])}%`, 70, 615);
  // próximas horas
  x.fillStyle="rgba(255,255,255,.07)"; x.beginPath(); x.roundRect ? x.roundRect(50,660,980,250,28) : x.rect(50,660,980,250); x.fill();
  for(let k=0;k<6;k++){ const i=i0+1+k*2; if(!h.time[i]) break; const cx = 50+80+k*165;
    x.textAlign="center"; x.fillStyle="#93a3c0"; x.font=F(500,28,"IBM Plex Mono"); x.fillText(hhmm(h.time[i]), cx, 710);
    const im = await svgImg(icon(h.weather_code[i],h.is_day[i],{gust:h.wind_gusts_10m[i],cloud:h.cloud_cover[i],forDark:1}), 90); if(im) x.drawImage(im, cx-45, 725, 90, 90);
    x.fillStyle="#eaf0fa"; x.font=F(600,44,"Barlow Condensed"); x.fillText(`${r0(h.temperature_2m[i])}°`, cx, 862);
    x.fillStyle="#62ccff"; x.font=F(700,24); x.fillText(h.precipitation_probability[i]>=10?`${h.precipitation_probability[i]}%`:"", cx, 895); }
  // próximos dias
  x.textAlign="left";
  for(let n=1;n<=3;n++){ if(!dd.time[n]) break; const y = 940+(n-1)*105, dt = parseLocal(dd.time[n]);
    x.fillStyle="#eaf0fa"; x.font=F(700,38); x.fillText(n===1?"Amanhã":DIAS_L[dt.getDay()], 70, y+62);
    const im = await svgImg(icon(dd.weather_code[n],1,{gust:dd.wind_gusts_10m_max[n],forDark:1}), 80); if(im) x.drawImage(im, 470, y+8, 80, 80);
    x.fillStyle="#62ccff"; x.font=F(700,30); x.fillText(dd.precipitation_probability_max[n]>=10?`${dd.precipitation_probability_max[n]}%`:"", 580, y+60);
    x.fillStyle="#eaf0fa"; x.font=F(600,46,"Barlow Condensed"); x.textAlign="right"; x.fillText(`${r0(dd.temperature_2m_max[n])}° / ${r0(dd.temperature_2m_min[n])}°`, 1010, y+62); x.textAlign="left"; }
  // alerta oficial e rodapé
  if(state.official && state.official.length){ const a = state.official[0];
    x.fillStyle="#ff9340"; x.font=F(700,32); x.fillText(`⚠ ${a.title} · ${a.src}`.slice(0,52), 70, 1275); }
  x.fillStyle="#93a3c0"; x.font=F(500,26); x.fillText("eliabeanger.github.io/tempo_agora", 70, 1318);
  x.textAlign="right"; x.fillStyle="#62ccff"; x.font=F(700,30,"Barlow Condensed"); x.fillText("PWSIS", 1010, 1318); x.textAlign="left";
  const blob = await new Promise(r=>cv.toBlob(r,"image/png"));
  const file = new File([blob], `tempo-${norm(state.loc.name||"local").replace(/\s+/g,"-")}-pwsis.png`, {type:"image/png"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:`Tempo em ${state.loc.name}`, text:`Tempo em ${state.loc.name} · Tempo Agora PWSIS ${appUrl()}`}); return; }
    catch(e){ if(e && e.name==="AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast("Imagem salva. Procure em Downloads.");
}
$("#btnShareImg").addEventListener("click", shareImage);

applyTheme();

/* =============== BOTÃO VOLTAR DO CELULAR fecha telas abertas =============== */
const overlays = []; let skipPop = 0;
function pushOverlay(name, close){ overlays.push({name, close}); try{ history.pushState({ov:name}, ""); }catch(e){} }
function popOverlay(name){ const i = overlays.findIndex(o=>o.name===name); if(i<0) return; overlays.splice(i,1); skipPop++; try{ history.back(); }catch(e){ skipPop--; } }
addEventListener("popstate", ()=>{ if(skipPop>0){ skipPop--; return; } const o = overlays.pop(); if(o) o.close(true); });

/* =============== CULTURAS =============== */
const CROPS = {
  soja:  {n:"Soja", soil:[15,20], frost:2, heat:35, kc:1.15, harvest:true,
          dis:[{n:"Ferrugem asiática", wet:8, t:[15,28], tip:"Folhas molhadas por muitas horas com temperatura amena favorecem a ferrugem. Monitore folhas do terço inferior e siga o calendário de fungicida."},
               {n:"Mofo-branco", wet:12, t:[12,22], tip:"Tempo úmido e fresco na floração favorece o mofo-branco. Atenção em áreas com histórico da doença."}],
          heatTip:"Calor acima de 35 °C na floração causa abortamento de flores e vagens."},
  milho: {n:"Milho", soil:[10,16], frost:1, heat:35, kc:1.2, harvest:true,
          dis:[{n:"Cercosporiose e mancha-branca", wet:10, t:[22,30], tip:"Umidade alta com calor favorece manchas foliares. Vistorie folhas acima da espiga."}],
          heatTip:"Calor acima de 35 °C no pendoamento prejudica a polinização e o enchimento de grãos."},
  trigo: {n:"Trigo", soil:[8,12], frost:2, heat:30, kc:1.15, harvest:true,
          dis:[{n:"Giberela", wetTotal:36, t:[20,28], tip:"Chuva e umidade por mais de 36 horas com 20 a 28 °C na floração favorecem a giberela. Proteja as espigas antes da chuva."},
               {n:"Brusone", wet:10, t:[23,30], tip:"Noites quentes e úmidas favorecem a brusone no espigamento."}],
          heatTip:"Calor acima de 30 °C na floração reduz o número de grãos.", frostTip:"Geada no espigamento e na floração pode esterilizar as espigas."},
  arroz: {n:"Arroz", soil:[15,20], frost:3, heat:35, kc:1.2, harvest:true, cold:15,
          dis:[{n:"Brusone", wet:10, t:[20,28], tip:"Folhas molhadas por mais de 10 horas com 20 a 28 °C favorecem a brusone. Evite excesso de nitrogênio."}],
          heatTip:"Calor extremo na floração causa esterilidade.", coldTip:"Temperaturas abaixo de 15 °C no emborrachamento causam esterilidade das espiguetas."},
  feijao:{n:"Feijão", soil:[15,20], frost:3, heat:30, kc:1.15, harvest:true,
          dis:[{n:"Antracnose", wet:10, t:[13,26], tip:"Tempo úmido e fresco favorece a antracnose. Use sementes sadias e monitore vagens."}],
          heatTip:"Calor acima de 30 °C na floração derruba flores."},
  fumo:  {n:"Fumo", soil:[15,18], frost:3, heat:35, kc:1.1, harvest:true,
          dis:[{n:"Mofo-azul", wet:10, t:[15,23], tip:"Noites frescas e úmidas favorecem o mofo-azul nos canteiros e na lavoura."}],
          heatTip:"Calor forte com solo seco causa murcha e queima das folhas."},
  hort:  {n:"Hortaliças", soil:[12,18], frost:3, heat:32, kc:1.05, harvest:false, smith:true,
          dis:[{n:"Requeima (tomate e batata)", smith:true, tip:"Dois dias seguidos com mínima acima de 10 °C e mais de 11 horas de umidade muito alta formam o período crítico da requeima."}],
          heatTip:"Calor forte queima folhas e derruba flores; irrigue no início da manhã."},
  cafe:  {n:"Café", soil:[15,18], frost:3, heat:34, kc:1.05, harvest:true,
          dis:[{n:"Ferrugem do cafeeiro", wet:6, t:[21,25], tip:"Folhas molhadas por mais de 6 horas com 21 a 25 °C favorecem a ferrugem."}],
          heatTip:"Calor acima de 34 °C na florada causa abortamento (estrelinhas)."},
  cana:  {n:"Cana", soil:[15,20], frost:2, heat:38, kc:1.25, harvest:true, dis:[],
          heatTip:"Calor extremo com solo seco reduz o crescimento."},
  past:  {n:"Pastagem", soil:[10,15], frost:2, heat:36, kc:0.95, harvest:false, dis:[],
          heatTip:"Calor forte aumenta o estresse dos animais: garanta sombra e água.", past:true}
};
let cropKey = store.get("wx_crop") || "soja";
function renderCropChips(){
  $("#crops").innerHTML = Object.entries(CROPS).map(([k,c])=>`<button class="crop" role="tab" data-crop="${k}" aria-selected="${k===cropKey}">${c.n}</button>`).join("");
}
$("#crops").addEventListener("click", e=>{ const b = e.target.closest(".crop"); if(!b) return; cropKey = b.dataset.crop; store.set("wx_crop", cropKey); renderCropChips(); renderCrop(); renderAgenda(); });
function wetStats(from, hours){
  const h = state.data.hourly; let run=0, runT=[], best={len:0,t:0}, total=0, totalT=[];
  for(let i=from;i<Math.min(h.time.length, from+hours);i++){
    const wet = h.relative_humidity_2m[i]>=90 || (h.precipitation[i]||0)>=0.1;
    if(wet){ run++; runT.push(h.temperature_2m[i]); total++; totalT.push(h.temperature_2m[i]); if(run>best.len) best={len:run, t:sum(runT)/runT.length}; }
    else { run=0; runT=[]; }
  }
  return {best, total, totalT: totalT.length ? sum(totalT)/totalT.length : 0};
}
function smithDays(){
  const h = state.data.hourly, dd = state.data.daily; let streak=0, bestStreak=0;
  dd.time.slice(0,5).forEach((day,n)=>{
    const hrs = h.time.map((t,i)=>t.slice(0,10)===day?i:-1).filter(i=>i>=0);
    const ok = dd.temperature_2m_min[n]>=10 && hrs.filter(i=>h.relative_humidity_2m[i]>=90).length>=11;
    streak = ok ? streak+1 : 0; bestStreak = Math.max(bestStreak, streak);
  });
  return bestStreak;
}
function cropCards(key){
  const c = CROPS[key], d = state.data, h = d.hourly, dd = d.daily, i0 = nowIndex();
  const soil24 = sum(h.soil_temperature_0cm.slice(i0,i0+24))/Math.max(1,h.soil_temperature_0cm.slice(i0,i0+24).length);
  const sm = h.soil_moisture_3_to_9cm[i0];
  const rain2 = sum(dd.precipitation_sum.slice(0,2)), rain3 = sum(dd.precipitation_sum.slice(0,3)), rain7 = sum(dd.precipitation_sum.slice(0,7));
  const et7 = sum(dd.et0_fao_evapotranspiration.slice(0,7)), need = et7*c.kc;
  const tminArr = dd.temperature_2m_min.slice(0,7), tmin = Math.min(...tminArr), tminDay = dd.time[tminArr.indexOf(tmin)];
  const tmaxArr = dd.temperature_2m_max.slice(0,7), tmax = Math.max(...tmaxArr), tmaxDay = dd.time[tmaxArr.indexOf(tmax)];
  const dayName = t => { const n = dd.time.indexOf(t); return n===0?"hoje":n===1?"amanhã":DIAS_L[parseLocal(t).getDay()].toLowerCase(); };
  let dry=0; for(const mm of dd.precipitation_sum){ if(mm<1) dry++; else break; }
  const cards = [];
  // plantio
  const plantTitle = c.past ? "Plantio e reforma de pasto" : key==="cafe"||key==="cana" ? "Plantio de mudas" : "Plantio e semeadura";
  if(soil24 < c.soil[0]) cards.push(["bad",plantTitle,"Esperar",`Solo frio (${r0(soil24)} °C em média). ${c.n} precisa de solo acima de ${c.soil[0]} °C, ideal acima de ${c.soil[1]} °C.`]);
  else if(sm < 0.18) cards.push([rain3>=10?"mid":"bad",plantTitle,rain3>=10?"Após a chuva":"Esperar", rain3>=10 ? `Solo seco agora, mas vêm ${r0(rain3)} mm em 3 dias. Plante logo depois da chuva.` : `Solo seco (${r0(sm*100)}%) e pouca chuva prevista. Espere umidade para garantir a germinação.`]);
  else if(sm >= 0.38) cards.push(["mid",plantTitle,"Esperar drenar","Solo encharcado: risco de compactação e de atolar máquinas."]);
  else if(Math.min(...dd.temperature_2m_min.slice(0,3)) <= c.frost){ const last = [0,1,2].filter(n=>dd.temperature_2m_min[n]<=c.frost).pop();
    cards.push(["mid",plantTitle,"Esperar a geada",`Solo em boas condições, mas há geada prevista ${dayName(dd.time[last])} (mínima de ${r0(dd.temperature_2m_min[last])} °C). Plante depois ${last===0?"de hoje":last===1?"de amanhã":`de ${dayName(dd.time[last])}`}, quando o frio passar.`]); }
  else if(rain2 >= 40) cards.push(["mid",plantTitle,"Cuidado",`Chuva forte nos próximos 2 dias (${r0(rain2)} mm) pode causar erosão e arrastar sementes.`]);
  else cards.push(["good",plantTitle,"Favorável",`Solo com ${r0(soil24)} °C e umidade de ${r0(sm*100)}%. ${soil24>=c.soil[1]?"Condição boa":"Condição aceitável"} para ${c.n.toLowerCase()}.`]);
  // doenças
  const w72 = wetStats(i0, 72);
  c.dis.forEach(ds=>{
    let lvl="good", txt;
    if(ds.smith){ const s = smithDays(); lvl = s>=2?"bad":s===1?"mid":"good"; txt = s>=2 ? `Período crítico previsto (${s} dias seguidos). ${ds.tip}` : s===1 ? `Um dia com condição favorável. ${ds.tip}` : "Sem período crítico nos próximos 5 dias."; }
    else if(ds.wetTotal){ const inT = w72.totalT>=ds.t[0] && w72.totalT<=ds.t[1]; lvl = w72.total>=ds.wetTotal && inT ? "bad" : w72.total>=ds.wetTotal/2 && inT ? "mid" : "good";
      txt = lvl==="good" ? `Baixo risco: ${w72.total} h de umidade alta em 72 h.` : `${w72.total} horas de umidade alta nas próximas 72 h, média de ${r0(w72.totalT)} °C. ${ds.tip}`; }
    else { const inT = w72.best.t>=ds.t[0] && w72.best.t<=ds.t[1]; lvl = w72.best.len>=ds.wet && inT ? "bad" : w72.best.len>=ds.wet/2 && inT ? "mid" : "good";
      txt = lvl==="good" ? `Baixo risco: maior período de folha molhada previsto é de ${w72.best.len} h.` : `Até ${w72.best.len} horas seguidas de folha molhada com ${r0(w72.best.t)} °C. ${ds.tip}`; }
    cards.push([lvl, ds.n, lvl==="bad"?"Risco alto":lvl==="mid"?"Atenção":"Risco baixo", txt]);
  });
  // frio, geada e calor
  if(tmin <= c.frost) cards.push(["bad","Geada",`${dayName(tminDay)}`,`Mínima de ${r0(tmin)} °C ${dayName(tminDay)}. ${c.frostTip||`${c.n} sofre com geada; proteja lavouras novas e viveiros.`}`]);
  else if(c.cold && tmin < c.cold) cards.push(["mid","Frio",dayName(tminDay),`Mínima de ${r0(tmin)} °C. ${c.coldTip}`]);
  else cards.push(["good","Frio e geada","Sem risco",`Mínima prevista de ${r0(tmin)} °C nos próximos 7 dias.`]);
  cards.push(tmax >= c.heat ? ["bad","Calor",dayName(tmaxDay),`Máxima de ${r0(tmax)} °C ${dayName(tmaxDay)}. ${c.heatTip}`] : ["good","Calor","Sem estresse",`Máxima prevista de ${r0(tmax)} °C, abaixo do limite de ${c.heat} °C para ${c.n.toLowerCase()}.`]);
  // água
  const bal = rain7 - need;
  cards.push(bal < -15 ? ["bad","Água na lavoura","Déficit",`A lavoura deve consumir cerca de ${r0(need)} mm na semana e a chuva prevista é de ${r0(rain7)} mm. Faltam ${r0(-bal)} mm.`]
    : bal < 0 ? ["mid","Água na lavoura","Leve déficit",`Consumo previsto de ${r0(need)} mm contra ${r0(rain7)} mm de chuva na semana.`]
    : ["good","Água na lavoura","Suficiente",`Chuva prevista (${r0(rain7)} mm) cobre o consumo da semana (${r0(need)} mm).`]);
  // colheita
  if(c.harvest) cards.push(dry>=3 ? ["good","Colheita",`${dry} dias secos`,`Sequência de ${dry} dias sem chuva a partir de hoje: boa janela para colher e secar.`]
    : dry>=1 ? ["mid","Colheita","Janela curta",`Só ${dry} dia(s) seco(s) antes da próxima chuva. Priorize as áreas prontas.`]
    : ["bad","Colheita","Esperar","Chuva prevista para hoje: evite colher com o produto úmido."]);
  if(c.past) cards.push([tmin<=c.frost||tmax>=c.heat?"mid":"good","Animais",tmin<=c.frost?"Frio":tmax>=c.heat?"Calor":"Tranquilo", tmin<=c.frost?"Noites de geada: ofereça abrigo e reforce a alimentação.":tmax>=c.heat?c.heatTip:"Condições confortáveis para o rebanho."]);
  return cards;
}
function renderCrop(){
  if(!state.data) return; const cards = cropCards(cropKey);
  $("#cropBody").innerHTML = `<div class="cropgrid">${cards.map(([cl,t,tag,p])=>`<div class="ccard ${cl}"><h4>${t}<span>${esc(tag)}</span></h4><p>${p}</p></div>`).join("")}</div>
    <p class="cropnote">Recomendações calculadas pela previsão para o seu local. As datas oficiais de plantio da sua região estão no Zoneamento Agrícola de Risco Climático (ZARC) do Ministério da Agricultura. Na dúvida, fale com o técnico da Emater ou da sua cooperativa.</p>`;
}
function agendaActs(key, n){
  const c = CROPS[key], d = state.data, h = d.hourly, dd = d.daily, day = dd.time[n];
  const hrs = h.time.map((t,i)=>t.slice(0,10)===day?i:-1).filter(i=>i>=0), dayHrs = hrs.filter(i=>{ const H=+h.time[i].slice(11,13); return H>=6 && H<=19; });
  const good = dayHrs.filter(i=>i+2<h.time.length && sprayRate(i).s===2);
  const mm = dd.precipitation_sum[n], prev = n>0 ? dd.precipitation_sum[n-1] : 0, storm = dd.weather_code[n]>=95;
  const rhDay = dayHrs.length ? sum(dayHrs.map(i=>h.relative_humidity_2m[i]))/dayHrs.length : 100;
  const acts = [];
  if(storm) acts.push(["bad","Trovoada: evite o campo"]);
  else if(mm>=15) acts.push(["bad",`Chuva forte ${r0(mm)} mm`]);
  else if(mm>=1) acts.push(["info",`Chuva ${r1(mm)} mm`]);
  if(dd.temperature_2m_min[n]<=c.frost) acts.push(["bad","Geada"]);
  if(good.length>=2) acts.push(["good",`Pulverizar ${+h.time[good[0]].slice(11,13)}h–${+h.time[good[good.length-1]].slice(11,13)+1}h`]);
  if(c.harvest && mm<1 && prev<5 && rhDay<80 && !storm) acts.push(["good","Colher"]);
  if(!c.past && mm<15 && !storm && Math.min(...dd.temperature_2m_min.slice(n, n+3)) > c.frost && dd.temperature_2m_max[n]>=c.soil[0]+8 && (n===0 ? h.soil_moisture_3_to_9cm[nowIndex()]>=0.18 : prev>=3 || h.soil_moisture_3_to_9cm[nowIndex()]>=0.2)) acts.push(["good","Plantar"]);
  if(!acts.length) acts.push(["mid","Dia de manutenção"]);
  return acts;
}
function renderAgenda(){
  if(!state.data) return;
  const c = CROPS[cropKey], dd = state.data.daily;
  $("#agendaCrop").textContent = c.n;
  $("#agenda").innerHTML = dd.time.slice(0,7).map((day,n)=>{ const dt = parseLocal(day), acts = agendaActs(cropKey, n);
    return `<div class="aday"><div class="dn">${n===0?"Hoje":n===1?"Amanhã":DIAS[dt.getDay()]}<small>${dt.getDate()}/${dt.getMonth()+1}</small></div>${icon(dd.weather_code[n],1,{gust:dd.wind_gusts_10m_max[n]})}<div class="acts">${acts.map(([cl,t])=>`<span class="act ${cl}">${t}</span>`).join("")}</div></div>`; }).join("");
}

/* =============== NOTÍCIAS =============== */
const NEWS_SRC = [
  {name:"MetSul Meteorologia", url:"https://metsul.com/feed/", mode:"all"},
  {name:"Canal Rural", url:"https://www.canalrural.com.br/feed/", mode:"topic"},
  {name:"Canal Rural", url:"https://www.canalrural.com.br/agricultura/feed/", mode:"topic"},
  {name:"Agência Brasil", url:"https://agenciabrasil.ebc.com.br/rss/geral/feed.xml", mode:"strict"}
];
const K_TEMPO = /chuv|clima|frio|calor|geada|temporal|tempestade|granizo|ventania|vendaval|ciclone|frente fria|seca\b|estiagem|enchente|cheia|inunda|alagamento|previs[aã]o|meteorolog|el ni[nñ]o|la ni[nñ]a|onda de|neblina|nevoeiro|temperatura|inmet|defesa civil|massa de ar|umidade/i;
const K_TEMPO_STRONG = /chuva|frio intenso|onda de (calor|frio)|geada|temporal|tempestade|granizo|ventania|vendaval|ciclone|frente fria|estiagem|enchente|inunda|alagamento|previs[aã]o do tempo|meteorolog|el ni[nñ]o|la ni[nñ]a|inmet|defesa civil/i;
const K_AGRO = /plantio|semeadura|colheita|safra|lavoura|soja|milho|trigo|arroz|feij[aã]o|caf[eé]\b|cana|algod[aã]o|fumo|tabaco|pastagem|irriga|praga|doen[cç]a|ferrugem|zoneamento|zarc|embrapa|emater|agricultor|produtor rural|hortali|fruticult|videira|lavouras|cultivo|cultura de|grãos|gr[aã]os/i;
const K_AGRO_STRONG = /plantio|semeadura|colheita|safra|lavoura|agricultor|produtor rural|embrapa|zoneamento agr/i;
const K_ALERTA = /alerta|aviso|temporal|tempestade|granizo|ciclone|enchente|cheia|inunda|alagamento|defesa civil|ventania|vendaval|risco de/i;
const GENT = {RS:"ga[uú]ch",SC:"catarinense",PR:"paranaense",SP:"paulista",MG:"mineir",RJ:"fluminense",GO:"goian",MT:"mato-grossense",MS:"sul-mato-grossense",BA:"baian",PE:"pernambucan",CE:"cearense",PA:"paraense",TO:"tocantinense",MA:"maranhense",PI:"piauiense",ES:"capixaba",DF:"brasiliense",RO:"rondoniense",AM:"amazonense"};
const news = {items:[], t:0, filter:"tudo", loading:false};
try{ const c = JSON.parse(localStorage.getItem("wx_news")||"null"); if(c && c.items){ news.items = c.items; news.t = c.t; } }catch(e){}
const stripHtml = h => { const d = new DOMParser().parseFromString(`<body>${h||""}`, "text/html"); return (d.body.textContent||"").replace(/\s+/g," ").trim(); };
function regionRe(){
  const l = state.loc; if(!l) return null; const parts = [];
  if(l.state) parts.push(norm(l.state).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  if(l.name) parts.push(norm(l.name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  if(l.uf && GENT[l.uf]) parts.push(GENT[l.uf]);
  return parts.length ? new RegExp(`(^|[^a-z])(${parts.join("|")})`, "i") : null;
}
function parseFeed(xml, src){
  const doc = new DOMParser().parseFromString(xml, "application/xml"), out = [];
  doc.querySelectorAll("item").forEach(it=>{
    const g = n => { const e = it.getElementsByTagName(n)[0]; return e ? e.textContent.trim() : ""; };
    const enc = it.getElementsByTagNameNS("*","encoded")[0], content = enc ? enc.textContent : "";
    const desc = g("description");
    let img = "";
    const mc = it.getElementsByTagNameNS("*","content")[0] || it.getElementsByTagNameNS("*","thumbnail")[0];
    if(mc && mc.getAttribute("url")) img = mc.getAttribute("url");
    const encl = it.getElementsByTagName("enclosure")[0]; if(!img && encl && /image/.test(encl.getAttribute("type")||"")) img = encl.getAttribute("url");
    if(!img) img = g("imagem-destaque");
    if(!img){ const m = (content+desc).match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i); if(m) img = m[1]; }
    const title = stripHtml(g("title")), link = g("link"), summary = stripHtml(desc).replace(/The post .*$|O post .* apareceu primeiro em.*$/i,"").slice(0,280);
    const date = new Date(g("pubDate") || g("dc:date") || Date.now());
    if(!title || !link) return;
    const text = `${title} ${summary}`;
    if(src.mode==="topic" && !(K_TEMPO.test(text) || K_AGRO.test(text))) return;
    if(src.mode==="strict" && !(K_TEMPO_STRONG.test(title) || K_AGRO_STRONG.test(title))) return;
    const cats = [];
    if(K_ALERTA.test(title)) cats.push("alerta");
    if(src.mode==="all" || K_TEMPO.test(text)) cats.push("tempo");
    if(K_AGRO.test(text)) cats.push("agro");
    out.push({title, link, summary, content, img, date:date.getTime(), src:src.name, cats});
  });
  return out;
}
async function loadNews(force=false){
  if(news.loading) return;
  if(!force && news.items.length && Date.now()-news.t < 30*60*1000){ renderNews(); return; }
  news.loading = true; if(!news.items.length) renderNews();
  const res = await Promise.allSettled(NEWS_SRC.map(s=>getData(s.url,{type:"text",proxy:true,timeout:15000}).then(x=>parseFeed(x,s))));
  const all = res.filter(r=>r.status==="fulfilled").flatMap(r=>r.value);
  news.loading = false;
  if(all.length){
    const seen = new Set(), items = [];
    all.sort((a,b)=>b.date-a.date).forEach(it=>{ const k = norm(it.title).slice(0,60); if(seen.has(it.link)||seen.has(k)) return; seen.add(it.link); seen.add(k); items.push(it); });
    news.items = items.slice(0,40); news.t = Date.now();
    const save = n => { try{ localStorage.setItem("wx_news", JSON.stringify({t:news.t, items:news.items.slice(0,n)})); return true; }catch(e){ return false; } };
    save(40) || save(20) || save(8);
  }
  renderNews(!all.length);
}
function agoTxt(ms){ const m = Math.round((Date.now()-ms)/60000); if(m<60) return `há ${Math.max(1,m)} min`; const h = Math.round(m/60); if(h<24) return `há ${h} h`; const d = Math.round(h/24); return d===1 ? "ontem" : `há ${d} dias`; }
function renderNews(failed=false){
  const re = regionRe();
  news.items.forEach(it=>{ it.reg = re ? re.test(norm(`${it.title} ${it.summary}`)) : false; });
  const counts = {tudo:news.items.length, regiao:news.items.filter(x=>x.reg).length, tempo:news.items.filter(x=>x.cats.includes("tempo")).length, agro:news.items.filter(x=>x.cats.includes("agro")).length, alerta:news.items.filter(x=>x.cats.includes("alerta")).length};
  const F = [["tudo","Tudo"],["regiao",state.loc&&state.loc.state?`${state.loc.uf||state.loc.state}`:"Sua região"],["tempo","Tempo"],["agro","Plantio e safra"],["alerta","Alertas"]];
  $("#nfilters").innerHTML = F.map(([k,l])=>`<button class="fchip ${news.filter===k?"on":""}" data-f="${k}">${esc(l)}${counts[k]?` · ${counts[k]}`:""}</button>`).join("");
  const list = news.items.filter(x=> news.filter==="tudo" || (news.filter==="regiao" ? x.reg : x.cats.includes(news.filter)));
  $("#newsUpd").textContent = news.loading ? "Atualizando…" : news.t ? `Atualizado ${agoTxt(news.t)}` : "";
  if(!news.items.length){ $("#nlist").innerHTML = news.loading ? `<div class="sk" style="height:90px"></div><div class="sk" style="height:90px"></div>` : `<div class="nempty">Não consegui carregar as notícias agora. Verifique a internet e puxe a tela para atualizar.</div>`; return; }
  $("#nlist").innerHTML = list.length ? list.map(it=>{
    const i = news.items.indexOf(it), tags = [];
    if(it.reg) tags.push(`<span class="tag t-regiao">Sua região</span>`);
    if(it.cats.includes("alerta")) tags.push(`<span class="tag t-alerta">Alerta</span>`); else if(it.cats.includes("tempo")) tags.push(`<span class="tag t-tempo">Tempo</span>`);
    if(it.cats.includes("agro")) tags.push(`<span class="tag t-agro">Campo</span>`);
    return `<button class="ncard ${it.img?"":"noimg"}" data-n="${i}"><div><div class="meta">${tags.join("")}<span>${esc(it.src)} · ${agoTxt(it.date)}</span></div><h3>${esc(it.title)}</h3><p>${esc(it.summary)}</p></div>${it.img?`<img src="${esc(it.img)}" alt="" loading="lazy" data-rm>`:""}</button>`;
  }).join("") : `<div class="nempty">Nenhuma notícia neste filtro agora.</div>`;
  if(failed) toast("Sem conexão: mostrando as últimas notícias salvas.");
}
$("#nfilters").addEventListener("click", e=>{ const b = e.target.closest("[data-f]"); if(!b) return; news.filter = b.dataset.f; renderNews(); });
$("#nlist").addEventListener("click", e=>{ const b = e.target.closest(".ncard"); if(b) openArticle(news.items[+b.dataset.n]); });

/* limpeza segura do HTML: só texto, títulos, listas, citações e imagens */
const SAFE = {P:1,BR:1,H2:1,H3:1,H4:1,UL:1,OL:1,LI:1,STRONG:1,B:1,EM:1,I:1,BLOCKQUOTE:1,FIGURE:1,FIGCAPTION:1,IMG:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1};
const JUNK = /apareceu primeiro em|leia (tamb[eé]m|mais)|siga (o|a|nosso)|inscreva-se|clique aqui|whatsapp|telegram|newsletter|publicidade|assine|baixe o app/i;
function cleanHtml(html, base){
  const doc = new DOMParser().parseFromString(`<body>${html||""}`, "text/html"), out = document.createElement("div");
  const walk = (node, into) => node.childNodes.forEach(n=>{
    if(n.nodeType===3){ into.appendChild(document.createTextNode(n.textContent)); return; }
    if(n.nodeType!==1) return;
    const tag = n.tagName;
    if(/^(SCRIPT|STYLE|IFRAME|NOSCRIPT|FORM|BUTTON|INPUT|SVG|NAV|ASIDE|FOOTER|HEADER|VIDEO|AUDIO|OBJECT|EMBED)$/.test(tag)) return;
    if(tag==="IMG"){
      let src = n.getAttribute("data-lazy-src")||n.getAttribute("data-src")||n.getAttribute("src")||"";
      if(!src || /^data:/.test(src) || (+n.getAttribute("width")||99) < 40) return;
      try{ src = new URL(src, base).href; }catch(e){ return; }
      if(!/^https:/.test(src)) return;
      const im = document.createElement("img"); im.src = src; im.alt = n.getAttribute("alt")||""; im.loading = "lazy"; im.setAttribute("data-rm",""); into.appendChild(im); return;
    }
    if(SAFE[tag]){
      if(tag==="P" && JUNK.test(n.textContent||"") && (n.textContent||"").length < 220) return;
      const el = document.createElement(tag==="B"?"STRONG":tag==="I"?"EM":tag); walk(n, el);
      if(tag==="P" && !el.textContent.trim() && !el.querySelector("img")) return;
      into.appendChild(el);
    } else walk(n, into);   // links e outras marcações viram só texto: o leitor fica no app
  });
  walk(doc.body, out);
  return out;
}
function loadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function fetchFullText(url){
  const html = await getData(url, {type:"text", proxy:true, timeout:20000});
  const doc = new DOMParser().parseFromString(html, "text/html");
  // torna os endereços de imagens e links absolutos sem alterar a base da página
  doc.querySelectorAll("img").forEach(im=>{ ["src","data-src","data-lazy-src"].forEach(at=>{ const v = im.getAttribute(at); if(v){ try{ im.setAttribute(at, new URL(v, url).href); }catch(e){} } }); im.removeAttribute("srcset"); });
  doc.querySelectorAll("a[href]").forEach(an=>{ try{ an.setAttribute("href", new URL(an.getAttribute("href"), url).href); }catch(e){} });
  try{ await loadScript("vendor/Readability.js"); const art = new Readability(doc).parse(); if(art && art.content && art.textContent.length > 300) return art.content; }catch(e){}
  const cand = doc.querySelector("article .entry-content, .entry-content, article, main") ; return cand ? cand.innerHTML : "";
}
let rdSize = store.get("wx_rdsize") || 17, rdItem = null;
document.documentElement.style.setProperty("--rd-size", rdSize+"px");
$("#rdText").addEventListener("click", ()=>{ rdSize = rdSize>=21 ? 15 : rdSize+2; store.set("wx_rdsize", rdSize); document.documentElement.style.setProperty("--rd-size", rdSize+"px"); toast(`Texto ${rdSize===15?"pequeno":rdSize===17?"normal":rdSize===19?"grande":"muito grande"}`); });
$("#rdShare").addEventListener("click", ()=>{ if(rdItem) shareOut(rdItem.title, `${rdItem.title} (${rdItem.src}) · via Tempo Agora PWSIS`, rdItem.link); });
$("#rdBack").addEventListener("click", ()=>closeArticle());
function closeArticle(fromBack){ if($("#reader").hidden) return; $("#reader").hidden = true; document.body.classList.remove("lock"); if(!fromBack) popOverlay("reader"); }
async function openArticle(it){
  if(!it) return; rdItem = it;
  const r = $("#reader"), body = $("#rdBody"); let host = ""; try{ host = new URL(it.link).hostname.replace(/^www\./,""); }catch(e){}
  $("#rdSrc").textContent = it.src;
  const head = `<h1 id="rdTitle">${esc(it.title)}</h1><div class="rd-meta">${esc(it.src)} · ${new Date(it.date).toLocaleString("pt-BR",{day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"})}</div>`;
  const foot = () => { const rel = news.items.filter(x=>x!==it && x.cats.some(c=>it.cats.includes(c))).slice(0,3);
    return `<div class="rd-foot"><span>Conteúdo de <b>${esc(it.src)}</b> (${esc(host)}), reproduzido a partir do feed público do veículo.</span><a class="btn ghost" href="${esc(it.link)}" target="_blank" rel="noopener">Abrir no site original</a>
      ${rel.length?`<span class="label" style="margin-top:8px">Mais notícias</span><div class="rd-more">${rel.map(x=>`<button class="ncard noimg" data-n="${news.items.indexOf(x)}"><div><div class="meta"><span>${esc(x.src)} · ${agoTxt(x.date)}</span></div><h3>${esc(x.title)}</h3></div></button>`).join("")}</div>`:""}</div>`; };
  const lead = it.img ? `<img src="${esc(it.img)}" alt="" data-rm>` : "";
  const render = html => { const clean = cleanHtml(html, it.link); if(it.img && clean.querySelector(`img[src="${CSS.escape(it.img)}"]`)) body.innerHTML = head; else body.innerHTML = head + lead; body.appendChild(clean); body.insertAdjacentHTML("beforeend", foot()); };
  const wasHidden = r.hidden; r.hidden = false; document.body.classList.add("lock"); r.scrollTop = 0;
  if(wasHidden) pushOverlay("reader", fb=>closeArticle(fb));
  if(stripHtml(it.content).length > 700){ render(it.content); return; }
  body.innerHTML = head + lead + `<p>${esc(it.summary)}</p><div class="sk" style="height:18px;margin:10px 0"></div><div class="sk" style="height:18px;margin:10px 0;width:80%"></div><div class="sk" style="height:18px;margin:10px 0;width:90%"></div>`;
  try{ const full = await fetchFullText(it.link); if(rdItem!==it) return; if(stripHtml(full).length > 300){ it.content = full; render(full); return; } }catch(e){}
  if(rdItem!==it) return;
  body.innerHTML = head + lead + `<p>${esc(it.summary)}</p><p class="muted">Não consegui carregar o texto completo agora. Tente de novo mais tarde ou abra no site.</p>` + foot();
}
$("#rdBody").addEventListener("click", e=>{ const b = e.target.closest(".ncard"); if(b) openArticle(news.items[+b.dataset.n]); });

/* =============== EXPLICAÇÕES EM LINGUAGEM SIMPLES =============== */
const curH = () => state.data ? nowIndex() : 0;
const GLOSS = {
  umidade:{t:"Umidade do ar", p:["Mostra quanto vapor de água tem no ar, de 0 a 100%.","Com umidade baixa o ar fica seco, a garganta resseca e o fogo se espalha fácil. Com umidade alta o tempo fica abafado e aparecem orvalho e neblina."],
    scale:[["var(--danger)","Muito seco","abaixo de 30%"],["var(--ok)","Confortável","30 a 60%"],["var(--warn)","Úmido","60 a 85%"],["var(--accent)","Muito úmido, abafado","acima de 85%"]],
    now:()=>`Agora: ${r0(state.data.current.relative_humidity_2m)}%.`},
  orvalho:{t:"Ponto de orvalho", p:["É a temperatura em que o ar fica tão cheio de água que ela vira gotinhas.","Quanto mais perto da temperatura do ar, mais abafado fica e maior a chance de orvalho de manhã e neblina. Ponto de orvalho acima de 20 °C é sinal de tempo pesado e abafado."],
    now:()=>`Agora: ponto de orvalho ${r0(state.data.hourly.dew_point_2m[curH()])} °C com o ar a ${r0(state.data.current.temperature_2m)} °C.`},
  sensacao:{t:"Sensação térmica", p:["É a temperatura que o corpo sente. O vento faz parecer mais frio; a umidade alta faz o calor parecer maior."], now:()=>`Agora: ${r0(state.data.current.temperature_2m)} °C no termômetro e sensação de ${r0(state.data.current.apparent_temperature)} °C.`},
  pressao:{t:"Pressão do ar", p:["É o peso do ar sobre nós, medido em hPa. O valor normal fica perto de 1013 hPa.","O mais importante é se ela está subindo ou caindo. Caindo rápido (mais de 2 hPa em 3 horas) costuma indicar mau tempo chegando. Subindo, o tempo tende a melhorar."],
    now:()=>{ const h=state.data.hourly, i=curH(), dp=state.data.current.pressure_msl-h.pressure_msl[Math.max(0,i-3)]; return `Agora: ${r0(state.data.current.pressure_msl)} hPa, ${Math.abs(dp)<0.6?"estável":dp>0?"subindo":"caindo"} nas últimas 3 horas.`; }},
  uv:{t:"Índice UV", p:["Mede a força dos raios do sol que queimam a pele. Vai de 0 a 11 ou mais.","A partir de 3 já é bom usar protetor. Entre 10h e 16h o índice é mais alto, mesmo com nuvens."],
    scale:[["var(--ok)","Baixo","0 a 2"],["var(--warn)","Moderado","3 a 5"],["var(--orange)","Alto","6 a 7"],["var(--danger)","Muito alto","8 a 10"],["var(--storm)","Extremo","11 ou mais"]],
    now:()=>`Máximo de hoje: ${r1(state.data.daily.uv_index_max[0])}.`},
  visibilidade:{t:"Visibilidade", p:["É até onde dá para enxergar. Abaixo de 1 km é neblina: dirija devagar e com farol baixo."]},
  mm:{t:"Milímetros de chuva", p:["1 mm de chuva é 1 litro de água em cada metro quadrado.","Em um dia: até 2 mm é chuva fraca, de 2 a 10 mm moderada, de 10 a 30 mm forte e acima de 30 mm muito forte, com risco de alagamento. Em uma hora, mais de 10 mm já é chuva forte."],
    scale:[["#9be7ff","Fraca","até 2 mm no dia"],["#4fb8ff","Moderada","2 a 10 mm"],["#2f7bff","Forte","10 a 30 mm"],["#ff4d5e","Muito forte","acima de 30 mm"]]},
  chance:{t:"Chance de chuva (%)", p:["40% de chance quer dizer que, em situações parecidas com esta, chove em 4 de cada 10 vezes nesse lugar.","Não é a parte do dia com chuva nem o tamanho da área. Olhe junto com os milímetros: chance alta com pouco milímetro é garoa; chance média com muito milímetro é pancada forte em alguns lugares."]},
  beaufort:{t:"Vento e rajadas", p:["A velocidade média é o vento constante. A rajada é um golpe de vento de poucos segundos, e é ela que derruba árvores e telhados.","A escala Beaufort (0 a 12) traduz a velocidade no que você vê na rua:"],
    scale:[["var(--ok)","0–2 Calmaria e aragem: fumaça sobe reta","até 11 km/h"],["var(--ok)","3–4 Brisa: folhas e bandeiras mexem","12 a 28 km/h"],["var(--accent)","5–6 Vento fresco: galhos balançam, poeira","29 a 49 km/h"],["var(--warn)","7–8 Vento forte: difícil andar, galhos quebram","50 a 74 km/h"],["var(--danger)","9 ou mais Ventania: destelha, derruba árvores","75 km/h ou mais"]],
    now:()=>`Agora: ${r0(state.data.current.wind_speed_10m)} km/h vindo de ${dirTxt(state.data.current.wind_direction_10m)}, rajadas de ${r0(state.data.current.wind_gusts_10m)} km/h.`},
  deltat:{t:"Delta T (pulverização)", p:["Mostra a rapidez com que a gota de defensivo evapora no ar. É calculado pela temperatura e pela umidade.","Entre 2 e 8 °C a gota chega bem na planta. Abaixo de 2 o ar está saturado: as gotas escorrem e o produto pode ficar suspenso e derivar. Acima de 8 a 10 as gotas finas evaporam antes de chegar na folha e o produto se perde."],
    scale:[["var(--warn)","Evitar: escorrimento e deriva","abaixo de 2 °C"],["var(--ok)","Ideal","2 a 8 °C"],["var(--orange)","Cuidado: use gotas maiores","8 a 10 °C"],["var(--danger)","Não pulverizar","acima de 10 °C"]],
    now:()=>`Agora: Delta T de ${r1(sprayRate(curH()).dT)} °C.`},
  et0:{t:"Evapotranspiração (ET₀)", p:["É a água que a terra e as plantas perdem para o ar por dia, em milímetros. 5 mm quer dizer 5 litros por metro quadrado.","Se a chuva da semana for menor do que a soma da ET₀, vai faltar água para a lavoura. Dias quentes, secos e com vento aumentam muito a perda."],
    now:()=>`Hoje: ${r1(state.data.daily.et0_fao_evapotranspiration[0])} mm. Nos próximos 7 dias: ${r0(sum(state.data.daily.et0_fao_evapotranspiration.slice(0,7)))} mm.`},
  radiacao:{t:"Horas de sol e radiação", p:["Horas de sol é o tempo com sol aberto no dia. A radiação (MJ/m²) é a energia do sol que chega ao chão, e é ela que a planta usa para crescer. Dias nublados seguidos atrasam o desenvolvimento da lavoura."]},
  solo:{t:"Umidade do solo", p:["Quanta água tem na terra perto da superfície (de 3 a 9 cm de profundidade), em porcentagem do volume.","Serve para saber se dá para plantar e se as máquinas vão atolar."],
    scale:[["var(--danger)","Seco: semente pode não germinar","abaixo de 15%"],["var(--warn)","Razoável","15 a 25%"],["var(--ok)","Bom para plantio","25 a 35%"],["var(--accent)","Encharcado: risco de compactar e atolar","acima de 38%"]],
    now:()=>`Agora: ${r0(state.data.hourly.soil_moisture_3_to_9cm[curH()]*100)}%.`},
  tempsolo:{t:"Temperatura do solo", p:["É a temperatura da terra na superfície. Cada cultura precisa de solo quente o bastante para a semente germinar rápido: soja e arroz gostam de solo acima de 20 °C; milho a partir de 16 °C; trigo germina com solo mais frio."]},
  vpd:{t:"Déficit de pressão de vapor", p:["Mostra o quanto o ar 'puxa' água das folhas.","Entre 0,4 e 1,2 kPa a planta respira e cresce bem. Abaixo disso o ar está saturado e favorece doenças de fungo. Acima de 1,5 a planta fecha os poros para não perder água e para de crescer."]},
  cape:{t:"Instabilidade (CAPE)", p:["É o 'combustível' que a atmosfera tem para formar nuvens de tempestade, medido em J/kg.","Sozinho ele não faz chover: precisa de umidade e de um empurrão, como uma frente fria. Mas quando está alto e chega chuva, os temporais podem ser fortes, com raios, vento e granizo."],
    scale:[["var(--ok)","Estável","abaixo de 500"],["var(--warn)","Instabilidade fraca","500 a 1000"],["var(--orange)","Moderada: trovoadas","1000 a 2500"],["var(--danger)","Forte: temporais e granizo","acima de 2500"]]},
  modelos:{t:"Modelos de previsão", p:["A previsão do tempo é calculada por supercomputadores que simulam a atmosfera. Cada centro do mundo tem o seu programa, chamado de modelo:",
      "<b>ECMWF</b>: Centro Europeu de Previsão. Costuma ser o mais preciso para vários dias.","<b>GFS</b>: serviço de meteorologia dos Estados Unidos. Muito usado no mundo inteiro.","<b>ICON</b>: serviço de meteorologia da Alemanha.","<b>JMA</b>: agência de meteorologia do Japão.",
      "A previsão principal do app escolhe automaticamente a melhor combinação para o seu local. Comparar os quatro mostra se a previsão está firme ou incerta."]},
  confianca:{t:"Confiança da previsão", p:["Compara os quatro modelos para cada dia."],
    scale:[["var(--ok)","Alta: todos concordam","temperatura com até 2 °C de diferença e todos dizem se chove ou não"],["var(--warn)","Média","até 4 °C de diferença ou chuva incerta"],["var(--danger)","Baixa: pode mudar","os modelos discordam; acompanhe as atualizações"]]},
  ar:{t:"Qualidade do ar", p:["O índice europeu (0 a 100 ou mais) junta os principais poluentes. O PM2.5 são partículas finíssimas, como fumaça de queimada, que entram fundo no pulmão."],
    scale:[["var(--ok)","Boa","0 a 20"],["#d7e04a","Razoável","20 a 40"],["var(--warn)","Moderada","40 a 60"],["var(--orange)","Ruim: evite exercício ao ar livre","60 a 80"],["var(--danger)","Muito ruim","80 a 100"],["var(--storm)","Extrema","acima de 100"]]},
  balanco:{t:"Resumo e balanço hídrico", p:["O resumo conta os dias com chuva, com sol, com vento forte e com trovoada nos próximos 14 dias.","O balanço hídrico é a chuva prevista menos a água que evapora (ET₀). Positivo: sobra água no solo. Negativo: a lavoura e a pastagem podem sentir falta de água."]},
  pulverizacao:{t:"Janela de pulverização", p:["Cada quadrado é uma hora das próximas 48 horas. Verde é hora boa para aplicar defensivo, amarelo é com cuidado e vermelho é para evitar.","Para ficar verde a hora precisa ter vento entre 3 e 10 km/h, rajada abaixo de 20 km/h, Delta T entre 2 e 8 °C, temperatura abaixo de 30 °C e nada de chuva nas 2 horas seguintes. Sempre siga a bula do produto."]}
};
function openHelp(key){
  const g = GLOSS[key]; if(!g) return;
  let now = ""; try{ if(g.now && state.data) now = g.now(); }catch(e){}
  openSheet(`<h3 id="sheetTitle">${g.t}</h3><p class="sub">Explicação simples</p>${g.p.map(x=>`<p>${x}</p>`).join("")}
    ${g.scale?`<div class="help-scale">${g.scale.map(([c,l,v])=>`<div><i style="background:${c}"></i><span>${l}</span><b>${v}</b></div>`).join("")}</div>`:""}
    ${now?`<div class="help-now">${now}</div>`:""}
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="helpAsk">Perguntar mais sobre isso</button></div>`);
  $("#helpAsk").onclick = ()=>{ closeSheet(); openChat(`O que é ${g.t.toLowerCase()}?`); };
}
document.addEventListener("click", e=>{ const b = e.target.closest("[data-help]"); if(!b) return; e.preventDefault(); e.stopPropagation(); openHelp(b.dataset.help); });
const LABEL_HELP = {"Umidade":"umidade","Pressão":"pressao","Índice UV":"uv","Visibilidade":"visibilidade","Chuva agora":"mm","Nuvens":"chance","Delta T":"deltat","ET₀ hoje":"et0","Horas de sol":"radiacao","Solo 3–9 cm":"solo","Temp. do solo":"tempsolo","Déficit de vapor":"vpd","Sensação":"sensacao","Chuva":"chance","Vento":"beaufort"};
function addHelpButtons(root){
  (root||document).querySelectorAll(".metric .label").forEach(l=>{ if(l.querySelector(".qi")) return; const k = LABEL_HELP[l.textContent.trim()]; if(k) l.insertAdjacentHTML("beforeend", `<button class="qi" data-help="${k}" aria-label="O que é ${l.textContent.trim()}">?</button>`); });
}

/* 14 dias: mostra 7 e abre o resto quando pedir */
let allDays = false;
function trimDays(){ $$("#days .dayd").forEach((d,i)=>d.hidden = !allDays && i>=7); $("#moreDays").textContent = allDays ? "Mostrar só 7 dias" : "Mostrar mais 7 dias"; }
$("#moreDays").addEventListener("click", ()=>{ allDays = !allDays; trimDays(); });

/* =============== ASSISTENTE: PERGUNTE AO TEMPO =============== */
const ask = {voice: store.get("wx_voice") ?? true, busy:false};
const CROP_WORDS = {soja:"soja",milho:"milho",trigo:"trigo",arroz:"arroz",feijao:"feijao",fumo:"fumo",tabaco:"fumo",hortalica:"hort",horta:"hort",tomate:"hort",batata:"hort",verdura:"hort",cafe:"cafe",cana:"cana",pasto:"past",pastagem:"past",gado:"past"};
const WEEK = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"];

/* entende o dia e a parte do dia */
function whichDays(q){
  const dd = state.data.daily, today = parseLocal(dd.time[0]).getDay(), n = [];
  let part = null;
  if(/\bmadrugada\b/.test(q)) part = [0,6]; else if(/\bmanha\b|\bcedo\b/.test(q)) part = [6,12]; else if(/\btarde\b/.test(q)) part = [12,18]; else if(/\bnoite\b|anoitecer/.test(q)) part = [18,24];
  if(/depois de amanha/.test(q)) n.push(2);
  else if(/amanha/.test(q)) n.push(1);
  if(/fim de semana|final de semana|\bfds\b/.test(q)){ for(let k=0;k<7;k++){ const w=(today+k)%7; if(w===6||w===0) n.push(k); } }
  WEEK.forEach((w,wi)=>{ if(new RegExp(`\\b${w}(-feira)?\\b`).test(q)) n.push((wi-today+7)%7); });
  const dm = q.match(/\bdia (\d{1,2})\b/); if(dm){ const k = dd.time.findIndex(t=>+t.slice(8,10)===+dm[1]); if(k>=0) n.push(k); }
  if(/semana|proximos dias|proximos 7|essa semana|esta semana/.test(q) && !n.length) for(let k=0;k<7;k++) n.push(k);
  if(/quando|qual dia|que dia|melhor dia/.test(q) && !n.length) for(let k=0;k<7;k++) n.push(k);
  if(!n.length) n.push(0);
  return {days:[...new Set(n)].filter(k=>k<dd.time.length).sort((a,b)=>a-b), part, now:/\bagora\b|neste momento|nesse momento|ja ta|esta chovendo|ta chovendo/.test(q)};
}
const dayLabel = n => { const dd = state.data.daily; return n===0?"hoje":n===1?"amanhã":`${DIAS_L[parseLocal(dd.time[n]).getDay()].toLowerCase()} (${+dd.time[n].slice(8,10)}/${+dd.time[n].slice(5,7)})`; };
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
function hoursOf(n, part){ const h = state.data.hourly, day = state.data.daily.time[n], i0 = nowIndex();
  return h.time.map((t,i)=>t.slice(0,10)===day && (n>0 || i>=i0) && (!part || (+t.slice(11,13)>=part[0] && +t.slice(11,13)<part[1])) ? i : -1).filter(i=>i>=0); }
function rainWindow(hrs){ const h = state.data.hourly, wet = hrs.filter(i=>h.precipitation_probability[i]>=40 || h.precipitation[i]>=0.3); if(!wet.length) return "";
  const a = +h.time[wet[0]].slice(11,13), b = +h.time[wet[wet.length-1]].slice(11,13)+1; return a===b-1 ? `por volta das ${a}h` : `entre ${a}h e ${b}h`; }

function ansRain(D){
  const h = state.data.hourly, dd = state.data.daily;
  if(D.now){ const c = state.data.current, pn = h.precipitation_probability[nowIndex()+1]||0, nc = $("#ncLine").textContent, raining = c.precipitation>=0.1 || /agora|continua/.test(nc);
    return raining ? `Sim, está chovendo agora. ${nc}` : `Agora não está chovendo. ${nc} Chance de ${pn}% na próxima hora.`; }
  const lines = D.days.map(n=>{
    const hrs = hoursOf(n, D.part), p = hrs.length ? Math.max(...hrs.map(i=>h.precipitation_probability[i]||0)) : dd.precipitation_probability_max[n];
    const mm = hrs.length ? sum(hrs.map(i=>h.precipitation[i])) : dd.precipitation_sum[n], win = rainWindow(hrs), when = dayLabel(n) + (D.part ? (D.part[0]===6?" de manhã":D.part[0]===12?" à tarde":D.part[0]===18?" à noite":" de madrugada") : "");
    if(p>=60 || mm>=2) return `${cap(when)}: sim, deve chover. Chance de ${p}%, cerca de ${r1(mm)} mm${win?`, mais provável ${win}`:""}.`;
    if(p>=30 || mm>=0.3) return `${cap(when)}: pode chover. Chance de ${p}%${mm>=0.1?`, até ${r1(mm)} mm`:""}${win?`, ${win}`:""}.`;
    return `${cap(when)}: não deve chover (chance de ${p}%).`;
  });
  if(D.days.length>3){ const rainy = D.days.filter(n=>dd.precipitation_sum[n]>=1 || dd.precipitation_probability_max[n]>=60);
    return rainy.length ? `Nos próximos dias deve chover ${rainy.map(dayLabel).join(", ")}. Total previsto de ${r0(sum(D.days.map(n=>dd.precipitation_sum[n])))} mm.` + (rainy.length<=3 ? "\n"+rainy.map(n=>lines[D.days.indexOf(n)]).join("\n") : "") : `Não há chuva importante prevista nos próximos ${D.days.length} dias.`; }
  return lines.join("\n");
}
function ansTemp(D, q){
  const dd = state.data.daily, c = state.data.current;
  if(D.now || (D.days.length===1 && D.days[0]===0 && !D.part && /agora|esta fazendo|ta fazendo/.test(q))) return `Agora faz ${r0(c.temperature_2m)} °C, com sensação de ${r0(c.apparent_temperature)} °C. Hoje a máxima é ${r0(dd.temperature_2m_max[0])} °C e a mínima ${r0(dd.temperature_2m_min[0])} °C.`;
  const lines = D.days.map(n=>{ const hrs = hoursOf(n, D.part), h = state.data.hourly;
    if(D.part && hrs.length){ const ts = hrs.map(i=>h.temperature_2m[i]); return `${cap(dayLabel(n))}: entre ${r0(Math.min(...ts))} e ${r0(Math.max(...ts))} °C nesse período.`; }
    const mx = dd.temperature_2m_max[n], mn = dd.temperature_2m_min[n], feel = mx>=32?" Dia quente.":mn<=5?" Madrugada bem fria.":mx<=15?" Dia frio.":"";
    return `${cap(dayLabel(n))}: mínima de ${r0(mn)} °C e máxima de ${r0(mx)} °C.${feel}`; });
  if(/frio|esfri/.test(q) && D.days.length>3){ const k = D.days.reduce((a,b)=>dd.temperature_2m_min[b]<dd.temperature_2m_min[a]?b:a); return `O dia mais frio dos próximos dias deve ser ${dayLabel(k)}, com mínima de ${r0(dd.temperature_2m_min[k])} °C.`; }
  if(/calor|quente|esquent/.test(q) && D.days.length>3){ const k = D.days.reduce((a,b)=>dd.temperature_2m_max[b]>dd.temperature_2m_max[a]?b:a); return `O dia mais quente deve ser ${dayLabel(k)}, com máxima de ${r0(dd.temperature_2m_max[k])} °C.`; }
  return lines.join("\n");
}
function ansFrost(){
  const dd = state.data.daily, cold = dd.time.map((t,n)=>n).filter(n=>n<10 && dd.temperature_2m_min[n]<=3);
  if(!cold.length){ const k = dd.temperature_2m_min.slice(0,10).reduce((a,b,i,arr)=>b<arr[a]?i:a,0); return `Não há risco de geada nos próximos 10 dias. A menor mínima prevista é ${r0(dd.temperature_2m_min[k])} °C, ${dayLabel(k)}.`; }
  return `Sim, há risco de geada: ${cold.map(n=>`${dayLabel(n)} (mínima de ${r0(dd.temperature_2m_min[n])} °C${dd.temperature_2m_min[n]<=0?", geada forte possível":""})`).join("; ")}. Proteja mudas, hortas e animais novos.`;
}
function ansWind(D){
  const dd = state.data.daily, c = state.data.current;
  if(D.now) return `Agora o vento está em ${r0(c.wind_speed_10m)} km/h vindo de ${dirTxt(c.wind_direction_10m)} (${beaufort(c.wind_speed_10m)[1].toLowerCase()}), com rajadas de ${r0(c.wind_gusts_10m)} km/h.`;
  return D.days.map(n=>{ const g = dd.wind_gusts_10m_max[n]; return `${cap(dayLabel(n))}: vento de até ${r0(dd.wind_speed_10m_max[n])} km/h vindo de ${dirTxt(dd.wind_direction_10m_dominant[n])}, rajadas de ${r0(g)} km/h.${g>=75?" Ventania perigosa: risco de destelhamento e queda de árvores.":g>=55?" Rajadas fortes: prenda objetos soltos.":g>=35?" Vento moderado.":" Vento fraco."}`; }).join("\n");
}
function ansStorm(D){
  const h = state.data.hourly, dd = state.data.daily, off = state.official||[];
  const days = D.days.length===1 && D.days[0]===0 && !/hoje/.test(D.q||"") ? [0,1,2] : D.days;
  const out = days.map(n=>{ const hrs = hoursOf(n); const st = hrs.filter(i=>h.weather_code[i]>=95), capeMax = hrs.length ? Math.max(...hrs.map(i=>h.cape[i]||0)) : 0;
    if(st.length) return `${cap(dayLabel(n))}: sim, há previsão de trovoada ${rainWindow(st) || `a partir das ${+h.time[st[0]].slice(11,13)}h`}${h.weather_code.slice(st[0],st[st.length-1]+1).some(c=>c>=96)?", com risco de granizo":""}.`;
    if(capeMax>=1000 && dd.precipitation_probability_max[n]>=40) return `${cap(dayLabel(n))}: atmosfera instável; podem se formar temporais isolados.`;
    return `${cap(dayLabel(n))}: sem previsão de temporal.`; });
  if(off.length) out.push(`⚠ Alerta oficial em vigor: ${off.map(a=>`${a.title} (${a.src})`).join("; ")}.`);
  return out.join("\n");
}
function ansSpray(D){
  const h = state.data.hourly;
  const out = D.days.slice(0,3).map(n=>{
    const hrs = hoursOf(n).filter(i=>{ const H=+h.time[i].slice(11,13); return H>=5 && H<=20 && i+2<h.time.length; });
    const good = hrs.filter(i=>sprayRate(i).s===2), mid = hrs.filter(i=>sprayRate(i).s===1);
    if(good.length){ let best=[good[0]], cur=[good[0]]; for(let k=1;k<good.length;k++){ if(good[k]===good[k-1]+1) cur.push(good[k]); else cur=[good[k]]; if(cur.length>best.length) best=[...cur]; }
      return `${cap(dayLabel(n))}: sim. Melhor janela das ${+h.time[best[0]].slice(11,13)}h às ${+h.time[best[best.length-1]].slice(11,13)+1}h (vento ${r0(h.wind_speed_10m[best[0]])} km/h, Delta T ${r1(sprayRate(best[0]).dT)} °C).`; }
    if(!hrs.length) return `${cap(dayLabel(n))}: o dia já está no fim.`;
    const cnt = {"vento forte":hrs.filter(i=>h.wind_speed_10m[i]>10||h.wind_gusts_10m[i]>20).length, "chuva":hrs.filter(i=>(h.precipitation_probability[i]||0)>=60||(h.precipitation[i]||0)>=0.3).length, "ar seco e quente (Delta T alto)":hrs.filter(i=>sprayRate(i).dT>8).length, "ar saturado (Delta T baixo)":hrs.filter(i=>sprayRate(i).dT<2).length};
    const why = Object.entries(cnt).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
    return `${cap(dayLabel(n))}: ${mid.length?"só com cuidado":"melhor não"}. Motivo: ${why.join(", ") || "condições fora do ideal"}.${mid.length?` Horas aceitáveis: ${+h.time[mid[0]].slice(11,13)}h a ${+h.time[mid[mid.length-1]].slice(11,13)+1}h.`:""}`;
  });
  return out.join("\n") + "\nSiga sempre a bula do produto.";
}
function ansCrop(topic, crop){
  const cards = cropCards(crop), c = CROPS[crop];
  const pick = t => cards.find(x=>x[1].toLowerCase().startsWith(t));
  if(topic==="plant"){ const k = cards[0]; const ag = [...$$("#agenda .aday")].map(d=>d.textContent).join(" ");
    const plantDays = state.data.daily.time.slice(0,7).map((t,n)=>n).filter(n=>agendaActs(crop,n).some(a=>a[1]==="Plantar"));
    return `${k[1]} de ${c.n.toLowerCase()}: ${k[2].toLowerCase()}. ${k[3]}${plantDays.length?`\nDias bons na semana: ${plantDays.map(dayLabel).join(", ")}.`:""}\nAs datas oficiais estão no Zoneamento Agrícola (ZARC).`; }
  if(topic==="harvest"){ const k = pick("colheita"); if(!k) return `Para ${c.n.toLowerCase()} a colheita é contínua; olhe a agenda de 7 dias na aba Campo.`;
    const hd = state.data.daily.time.slice(0,7).map((t,n)=>n).filter(n=>agendaActs(crop,n).some(a=>a[1]==="Colher"));
    return `Colheita de ${c.n.toLowerCase()}: ${k[2].toLowerCase()}. ${k[3]}${hd.length?`\nDias bons para colher: ${hd.map(dayLabel).join(", ")}.`:""}`; }
  if(topic==="disease"){ const ds = cards.filter(x=>c.dis.some(d=>d.n===x[1])); return ds.length ? ds.map(x=>`${x[1]}: ${x[2].toLowerCase()}. ${x[3]}`).join("\n") : `Não tenho alerta de doença pelo clima para ${c.n.toLowerCase()}.`; }
  return `${c.n}:\n` + cards.map(x=>`• ${x[1]}: ${x[2]}`).join("\n") + "\nDetalhes na aba Campo.";
}
function ansGeneral(D){
  const dd = state.data.daily, c = state.data.current;
  if(D.now) return `Agora em ${state.loc.name}: ${r0(c.temperature_2m)} °C, ${wmo(c.weather_code)[0].toLowerCase()}, sensação de ${r0(c.apparent_temperature)} °C, vento de ${r0(c.wind_speed_10m)} km/h.`;
  if(D.days.length===1 && D.days[0]===0 && !D.part) return $("#daySum").textContent;
  return D.days.map(n=>`${cap(dayLabel(n))}: ${wmo(dd.weather_code[n])[0].toLowerCase()}, ${r0(dd.temperature_2m_min[n])} a ${r0(dd.temperature_2m_max[n])} °C, chuva ${dd.precipitation_probability_max[n]}%${dd.precipitation_sum[n]>=1?` (${r1(dd.precipitation_sum[n])} mm)`:""}.`).join("\n");
}
function ansAlerts(){ const off = state.official||[], calc = calcAlerts();
  let t = off.length ? `Alertas oficiais para ${state.loc.name}:\n` + off.map(a=>`⚠ ${a.title} (${a.src}, ${a.sevTxt||""})${a.end?` até ${fmtDT(a.end)}`:""}`).join("\n") : `Não há alerta oficial do INMET ou da Defesa Civil para ${state.loc.name} agora.`;
  if(calc.length) t += `\nPela previsão, fique atento a: ${calc.slice(0,3).map(a=>a.title.toLowerCase()).join(", ")}.`;
  return t; }
function ansSun(){ const dd = state.data.daily, len = dd.daylight_duration[0]/3600; return `Hoje o sol nasce às ${hhmm(dd.sunrise[0])} e se põe às ${hhmm(dd.sunset[0])}, com ${Math.floor(len)} h ${Math.round(len%1*60)} min de luz. Amanhã nasce às ${hhmm(dd.sunrise[1])} e se põe às ${hhmm(dd.sunset[1])}.`; }
function ansMoon(){ const a = moonAge(new Date()), ill = Math.round((1-Math.cos(2*Math.PI*a/SYN))/2*100);
  const nx = [["lua nova",0],["quarto crescente",SYN/4],["lua cheia",SYN/2],["quarto minguante",3*SYN/4]].map(([nm,q])=>({nm, w:new Date(Date.now()+(((q-a)%SYN+SYN)%SYN)*864e5)})).sort((x,y)=>x.w-y.w)[0];
  return `Hoje a lua está em fase de ${moonName(a).toLowerCase().replace(/^lua /,"")}, ${ill}% iluminada. A próxima fase é ${nx.nm}, por volta de ${nx.w.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}.`; }
function ansLaundry(){ const h = state.data.hourly, i0 = nowIndex(); const dry = []; for(let i=i0;i<i0+12 && i<h.time.length;i++){ if((h.precipitation_probability[i]||0)<30 && h.is_day[i]) dry.push(i); }
  if(dry.length>=4 && h.relative_humidity_2m[i0]<80) return `Sim, dá para estender roupa: tempo seco ${rainWindow(dry).replace(/^por volta das|^entre/, m=>m==="entre"?"entre":"por volta das")} com umidade de ${r0(h.relative_humidity_2m[i0])}%.`.replace("tempo seco por volta","tempo seco por volta");
  return dry.length ? `Dá, mas seca devagar: poucas horas secas pela frente e umidade de ${r0(h.relative_humidity_2m[i0])}%.` : "Hoje não é um bom dia: há chuva ou o dia já está acabando."; }
function ansUv(){ const u = state.data.daily.uv_index_max[0]; return `O índice UV máximo hoje é ${r1(u)} (${u<3?"baixo":u<6?"moderado":u<8?"alto":u<11?"muito alto":"extremo"}). ${u>=3?"Use protetor solar e chapéu, principalmente entre 10h e 16h.":"Risco baixo de queimadura."}`; }
function ansAir(){ const a = state.air && state.air.current; if(!a) return "Não tenho a qualidade do ar agora. Tente de novo em instantes."; const v = a.european_aqi;
  return `A qualidade do ar está ${v<=20?"boa":v<=40?"razoável":v<=60?"moderada":v<=80?"ruim":"muito ruim"} (índice ${r0(v)}).${v>60?" Evite exercícios ao ar livre.":""}`; }
function ansHum(){ const c = state.data.current, dp = state.data.hourly.dew_point_2m[nowIndex()]; return `A umidade agora é de ${r0(c.relative_humidity_2m)}%${dp>=20?" e o tempo está abafado":c.relative_humidity_2m<30?": ar muito seco, beba água":""}. Ponto de orvalho: ${r0(dp)} °C.`; }
const GLOSS_KEYS = [["delta ?t","deltat"],["evapotranspira|\\bet0\\b|\\bet ?₀","et0"],["\\bcape\\b|instabilidade","cape"],["ponto de orvalho|orvalho","orvalho"],["pressao","pressao"],["indice uv|\\buv\\b|ultravioleta","uv"],["beaufort|rajada","beaufort"],["deficit de (pressao de )?vapor|\\bvpd\\b","vpd"],["ecmwf|\\bgfs\\b|\\bicon\\b|\\bjma\\b|modelo","modelos"],["confianca","confianca"],["balanco hidrico","balanco"],["pm ?2[.,]?5|qualidade do ar|poluicao","ar"],["umidade do solo|solo","solo"],["milimetro|\\bmm\\b","mm"],["probabilidade|chance|porcentagem","chance"],["sensacao","sensacao"],["umidade","umidade"],["visibilidade","visibilidade"],["pulveriza","pulverizacao"]];
function ansGloss(q){ for(const [re,k] of GLOSS_KEYS) if(new RegExp(re).test(q)){ const g = GLOSS[k]; let t = `${g.t}: ${g.p.map(x=>x.replace(/<[^>]+>/g,"")).join(" ")}`; try{ if(g.now && state.data) t += "\n" + g.now(); }catch(e){} return t; } return null; }

/* outra cidade: "vai chover em Cruz Alta amanhã?" */
async function otherCity(q){
  const m = q.match(/\bem ([a-z][a-z' -]{2,40})/); if(!m) return null;
  const stop = /\b(amanha|hoje|depois|agora|sabado|domingo|segunda|terca|quarta|quinta|sexta|fim de semana|semana|de manha|a tarde|a noite|casa|campo|lavoura|minha|meu|relacao)\b.*$/;
  const name = m[1].replace(stop,"").replace(/\s+(vai|esta|tem|de)$/,"").trim(); if(name.length<3) return null;
  if(state.loc && norm(state.loc.name)===name) return null;
  const g = await getData(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=pt&format=json`);
  const r = (g.results||[]).sort((a,b)=>(b.country_code==="BR")-(a.country_code==="BR"))[0]; if(!r) return {txt:`Não encontrei a cidade "${name}".`};
  const f = await getData(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max&timezone=auto&forecast_days=7`);
  const D = whichDays(q), dd = f.daily, lbl = n => n===0?"hoje":n===1?"amanhã":DIAS_L[parseLocal(dd.time[n]).getDay()].toLowerCase();
  const lines = D.days.map(n=>`${cap(lbl(n))}: ${wmo(dd.weather_code[n])[0].toLowerCase()}, ${r0(dd.temperature_2m_min[n])} a ${r0(dd.temperature_2m_max[n])} °C, chuva ${dd.precipitation_probability_max[n]}%${dd.precipitation_sum[n]>=1?` (${r1(dd.precipitation_sum[n])} mm)`:""}.`);
  return {txt:`Em ${r.name}${r.admin1?` (${r.admin1})`:""}: agora ${r0(f.current.temperature_2m)} °C.\n`+lines.join("\n"), src:`Previsão Open-Meteo para ${r.name}`};
}

async function answer(raw){
  if(!state.data) return {txt:"Ainda estou carregando a previsão. Tente de novo em alguns segundos."};
  const q = norm(raw).replace(/[?!.,;]/g," ").replace(/\s+/g," ").trim(), D = whichDays(q); D.q = q;
  const cropHit = Object.keys(CROP_WORDS).find(w=>new RegExp(`\\b${w}s?\\b`).test(q)), crop = cropHit ? CROP_WORDS[cropHit] : cropKey;
  const has = re => re.test(q), src = `Previsão para ${state.loc.name}`;
  if(!q) return null;
  if(/^(oi|ola|bom dia|boa tarde|boa noite|e ai)\b/.test(q) && q.split(" ").length<=4) return {txt:`Olá! Sou o assistente do Tempo Agora PWSIS. Pergunte, por exemplo: "vai chover amanhã?", "posso pulverizar hoje?" ou "quando plantar ${CROPS[crop].n.toLowerCase()}?"`};
  if(/obrigad|valeu/.test(q)) return {txt:"De nada! Qualquer dúvida sobre o tempo, é só perguntar."};
  if(/preco|cotacao|valor da saca|\bsaca\b|mercado|bolsa|dolar/.test(q)) return {txt:"Não tenho cotações de preço: o Tempo Agora é focado em tempo e manejo da lavoura. Na aba Notícias aparecem reportagens sobre safra, e para preços consulte sua cooperativa ou um site de cotações."};
  if(has(/o que (e|significa|quer dizer)|explica|significado|pra que serve|para que serve|como funciona|como ler/)){ const g = ansGloss(q); if(g) return {txt:g, src:"Explicação do Tempo Agora PWSIS"}; }
  try{ const oc = await otherCity(q); if(oc) return oc; }catch(e){ }
  if(has(/alerta|aviso|defesa civil|perigo/)) return {txt:ansAlerts(), src:"INMET, Defesa Civil e previsão"};
  if(has(/pulveriz|aplicar|aplicacao|passar veneno|veneno|defensivo|herbicida|fungicida|inseticida|secante/)) return {txt:ansSpray(D), src};
  if(has(/plant|semea|semeadura/)) return {txt:ansCrop("plant", crop), src};
  if(has(/colh/)) return {txt:ansCrop("harvest", crop), src};
  if(has(/doenca|ferrugem|fungo|mofo|giberela|brusone|requeima|antracnose|praga/)) return {txt:ansCrop("disease", crop), src};
  if(cropHit && !has(/chov|chuva|frio|calor|vento|geada/)) return {txt:ansCrop("all", crop), src};
  if(has(/gead|gear/)) return {txt:ansFrost(), src};
  if(has(/tempestade|trovoad|temporal|raio|granizo|pedra/)) return {txt:ansStorm(D), src};
  if(has(/chov|chuva|guarda.?chuva|molhar|garoa|pancada/)) return {txt:ansRain(D), src};
  if(has(/roupa|varal|secar roupa|lavar roupa/)) return {txt:ansLaundry(), src};
  if(has(/vento|ventar|ventania|rajada|ventando/)) return {txt:ansWind(D), src};
  if(has(/nascer do sol|por do sol|amanhece|anoitece|escurece|horas de luz/)) return {txt:ansSun(), src};
  if(has(/\blua\b/)) return {txt:ansMoon(), src:"Calendário lunar"};
  if(has(/protetor|queimar|\buv\b|sol forte|ultravioleta/)) return {txt:ansUv(), src};
  if(has(/qualidade do ar|poluic|fumaca|queimada/)) return {txt:ansAir(), src:"Qualidade do ar (Open-Meteo)"};
  if(has(/umidade|abafad|seco o ar|ar seco/)) return {txt:ansHum(), src};
  if(has(/frio|calor|quente|temperatura|graus|esfri|esquent|agasalho|casaco|minima|maxima|sensacao/)) return {txt:ansTemp(D, q), src};
  if(has(/tempo|previsao|clima|como (vai|fica|esta)|vai ficar|vai estar/) || D.days.length>1 || /amanha|hoje|agora|semana/.test(q)) return {txt:ansGeneral(D), src};
  const g = ansGloss(q); if(g) return {txt:g, src:"Explicação do Tempo Agora PWSIS"};
  return {txt:`Ainda não sei responder isso. Posso ajudar com chuva, temperatura, geada, vento, temporais, alertas, pulverização, plantio, colheita e doenças das lavouras, lua, nascer do sol e o significado dos índices do app.`, miss:true};
}

/* tela do chat */
function sugs(){ const c = CROPS[cropKey].n.toLowerCase();
  return ["Vai chover amanhã?","Posso pulverizar hoje?",`Quando plantar ${c}?`,"Vai gear esta semana?","Como fica o fim de semana?","Tem algum alerta?","Vai ventar forte?","O que é Delta T?",`Posso colher ${c}?`,"Qual a fase da lua?"]; }
function renderSugs(){ $("#chatSugs").innerHTML = sugs().map(s=>`<button class="fchip" data-q="${esc(s)}">${esc(s)}</button>`).join(""); }
function addMsg(who, txt, src){
  const el = document.createElement("div"); el.className = `msg ${who}`; el.textContent = txt;
  if(who==="bot"){ if(src){ const s = document.createElement("span"); s.className="src"; s.textContent = src; el.appendChild(s); }
    const b = document.createElement("button"); b.className="say"; b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>Ouvir`; b.onclick = ()=>{ if(b.dataset.on){ stopSpeak(); delete b.dataset.on; b.lastChild.textContent="Ouvir"; return; } $$(".say[data-on]").forEach(x=>{ delete x.dataset.on; x.lastChild.textContent="Ouvir"; }); b.dataset.on=1; b.lastChild.textContent="Parar"; speak(txt, ()=>{ delete b.dataset.on; b.lastChild.textContent="Ouvir"; }); }; el.appendChild(b); }
  $("#chatLog").appendChild(el); $("#chatLog").scrollTop = $("#chatLog").scrollHeight; return el;
}
async function sendQ(q, spoken=false){
  q = (q||"").trim(); if(!q || ask.busy) return;
  ask.busy = true; addMsg("me", q); $("#chatInput").value = "";
  const t = addMsg("bot typing", "Pensando…"); t.querySelector(".say")?.remove();
  let r; try{ r = await answer(q); }catch(e){ r = {txt:"Não consegui buscar essa informação agora. Verifique a internet e tente de novo."}; }
  t.remove(); addMsg("bot", r.txt, r.src);
  if(ask.voice || spoken) speak(r.txt);
  ask.busy = false;
}
function openChat(q, spoken=false, noFocus=false){
  const c = $("#chat");
  if(c.hidden){ c.hidden = false; document.body.classList.add("lock"); pushOverlay("chat", fb=>closeChat(fb)); renderSugs();
    if(!$("#chatLog").children.length) addMsg("bot", `Olá! Pergunte o que quiser sobre o tempo em ${state.loc ? state.loc.name : "sua cidade"}: chuva, frio, vento, geada, pulverização, plantio, colheita ou o que significa algum índice. Você pode escrever ou tocar no microfone.`); }
  if(q) sendQ(q, spoken); else if(!noFocus) setTimeout(()=>$("#chatInput").focus(), 60);
}
function closeChat(fromBack){ if($("#chat").hidden) return; $("#chat").hidden = true; document.body.classList.remove("lock"); stopSpeak(); cancelListening(); if(!fromBack) popOverlay("chat"); }
$("#chatBack").addEventListener("click", ()=>closeChat());
$("#chatForm").addEventListener("submit", e=>{ e.preventDefault(); sendQ($("#chatInput").value); });
$("#askBar").addEventListener("submit", e=>{ e.preventDefault(); const q = $("#askInput").value; $("#askInput").value = ""; openChat(q); });
$("#askInput").addEventListener("focus", ()=>{ if(!$("#askInput").value) { $("#askInput").blur(); openChat(); } });
$("#chatSugs").addEventListener("click", e=>{ const b = e.target.closest("[data-q]"); if(b) sendQ(b.dataset.q); });
$("#fabAsk").addEventListener("click", ()=>openChat());
const setVoiceBtn = () => $("#chatVoice").setAttribute("aria-pressed", ask.voice);
$("#chatVoice").addEventListener("click", ()=>{ ask.voice = !ask.voice; store.set("wx_voice", ask.voice); setVoiceBtn(); if(!ask.voice) stopSpeak(); toast(ask.voice ? "Respostas faladas ligadas" : "Respostas faladas desligadas"); });
setVoiceBtn();
/* =============== VOZ: fala em português do Brasil, com pronúncia certa =============== */
const voiceCfg = Object.assign({name:"", rate:1.0}, store.get("wx_voicecfg")||{});
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DIRS = {N:"norte",NNE:"nor-nordeste",NE:"nordeste",ENE:"lés-nordeste",L:"leste",ESE:"lés-sudeste",SE:"sudeste",SSE:"su-sudeste",S:"sul",SSO:"su-sudoeste",SO:"sudoeste",OSO:"oés-sudoeste",O:"oeste",ONO:"oés-noroeste",NO:"noroeste",NNO:"nor-noroeste"};
const WD = {"seg.":"segunda-feira","ter.":"terça-feira","qua.":"quarta-feira","qui.":"quinta-feira","sex.":"sexta-feira","sáb.":"sábado","dom.":"domingo"};
const hourWord = h => { h = +h; return h===0||h===24 ? "meia-noite" : h===12 ? "meio-dia" : h===1 ? "uma hora" : `${h} horas`; };
const hourNum = h => { h = +h; return h===0||h===24 ? "meia-noite" : h===12 ? "meio-dia" : String(h); };
function speakable(t){
  let s = " " + t + " ";
  s = s.replace(/[•⚠🌦]/g, m => m==="⚠" ? " Atenção! " : " ");
  s = s.replace(/↑\s?(-?\d+)°/g,"máxima de $1 graus").replace(/↓\s?(-?\d+)°/g,"mínima de $1 graus");
  // dias da semana abreviados e datas
  s = s.replace(/\b(seg|ter|qua|qui|sex|sáb|dom)\.,?/g, m => (WD[m.replace(",","")]||m) + ",");
  s = s.replace(/\(?\b(\d{1,2})\/(\d{1,2})\)?/g, (m,d,mo) => +mo>=1 && +mo<=12 ? ` ${+d===1?"primeiro":+d} de ${MESES[+mo-1]} ` : m);
  s = s.replace(/(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*,\s*(\d{1,2}):(\d{2})/g, "$1, às $2:$3");
  // horários
  s = s.replace(/\b(\d{1,2})h\s?[–-]\s?(\d{1,2})h\b/g, (m,a,b)=>`das ${hourNum(a)} às ${hourWord(b)}`);
  s = s.replace(/\bdas (\d{1,2})h às (\d{1,2})h\b/g, (m,a,b)=>`das ${hourNum(a)} às ${hourWord(b)}`);
  s = s.replace(/\bentre (\d{1,2})h e (\d{1,2})h\b/g, (m,a,b)=>`entre ${hourNum(a)} e ${hourWord(b)}`);
  s = s.replace(/\b(\d{1,2}):00\b/g, (m,h)=>hourWord(h)).replace(/\b(\d{1,2}):(\d{2})\b/g, (m,h,mi)=>`${hourNum(h)} e ${+mi}`);
  s = s.replace(/\b(\d{1,2})h\b/g, (m,h)=>hourWord(h));
  s = s.replace(/às meia-noite/g,"à meia-noite").replace(/às meio-dia/g,"ao meio-dia").replace(/das meia-noite/g,"da meia-noite").replace(/das meio-dia/g,"do meio-dia").replace(/das uma hora/g,"da uma hora").replace(/às uma hora/g,"à uma hora");
  // direção do vento
  s = s.replace(/(de|Vento|vento) (NNE|ENE|ESE|SSE|SSO|OSO|ONO|NNO|NE|SE|SO|NO|N|L|S|O)\b/g, (m,p,d)=>`${p} ${DIRS[d]}`);
  // temperaturas e unidades
  s = s.replace(/-\s?1(?![\d,])\s?°C?/g,"menos 1 grau").replace(/-\s?(\d+(?:,\d+)?)\s?°C?/g,"menos $1 graus").replace(/\b1(?![\d,])\s?°C?/g,"1 grau").replace(/\s?°C|°/g," graus");
  s = s.replace(/km\/h/g,"quilômetros por hora").replace(/\b1 mm\b/g,"1 milímetro").replace(/\bmm\/h\b/g,"milímetros por hora").replace(/(\d)\s?mm\b/g,"$1 milímetros").replace(/\bmm\b/g,"milímetros");
  s = s.replace(/hPa/g,"hectopascais").replace(/kPa/g,"quilopascais").replace(/J\/kg/g,"joules por quilo").replace(/µg\/m³/g,"microgramas por metro cúbico").replace(/MJ\/m²/g,"megajoules por metro quadrado").replace(/m³\/m³/g,"");
  s = s.replace(/\bET₀|\bET0\b/g,"E T zero").replace(/\bUV\b/g,"U V").replace(/\bPWSIS\b/g,"Pê Dáblio Sis").replace(/\bZARC\b/g,"Zarc").replace(/\bINMET\b/g,"Inmet").replace(/\bCAPE\b/g,"Cape").replace(/\bECMWF\b/g,"E C M W F").replace(/\bGFS\b/g,"G F S").replace(/\bJMA\b/g,"J M A").replace(/\bRS\b/g,"Rio Grande do Sul");
  s = s.replace(/(\d),(\d)/g,"$1 vírgula $2").replace(/·/g,", ").replace(/[()]/g,", ").replace(/~/g,"").replace(/\n+/g,". ").replace(/graus (mínima|máxima)/g,"graus, $1").replace(/,\s*([;:])/g,"$1").replace(/\s+([,.!?;:])/g,"$1").replace(/([,.]){2,}/g,"$1").replace(/\s{2,}/g," ");
  return s.trim();
}
function chunks(t){ const parts = t.split(/(?<=[.!?;])\s+/); const out=[]; let cur="";
  parts.forEach(p=>{ if((cur+" "+p).length > 170 && cur){ out.push(cur); cur=p; } else cur = cur ? cur+" "+p : p; }); if(cur) out.push(cur);
  return out.flatMap(c=>c.length>220 ? c.split(/,\s+/) : [c]); }
let voicesReady = null;
function getVoices(){
  if(!("speechSynthesis" in window)) return Promise.resolve([]);
  if(voicesReady) return voicesReady;
  voicesReady = new Promise(res=>{ let v = speechSynthesis.getVoices(); if(v.length) return res(v);
    const done = ()=>res(speechSynthesis.getVoices()); speechSynthesis.addEventListener?.("voiceschanged", done, {once:true}); setTimeout(done, 1500); });
  return voicesReady;
}
function voiceScore(v){ let s = 0; const l = (v.lang||"").replace("_","-").toLowerCase(), n = v.name.toLowerCase();
  if(l==="pt-br") s += 10; else if(l.startsWith("pt")) s += (n.includes("brasil")||n.includes("brazil")) ? 9 : 2; else return -99;
  if(/portugal|pt-pt/.test(n) || l==="pt-pt") s -= 6;
  if(/natural|neural|enhanced|premium|wavenet|online/.test(n)) s += 4;
  if(/google/.test(n)) s += 3; if(/francisca|antonio|thalita|luciana|felipe|daniel/.test(n)) s += 2;
  if(v.localService===false) s += 1; return s; }
async function pickVoice(){ const vs = await getVoices(); const pt = vs.filter(v=>voiceScore(v)>-99).sort((a,b)=>voiceScore(b)-voiceScore(a));
  return (voiceCfg.name && pt.find(v=>v.name===voiceCfg.name)) || pt[0] || null; }
let speakToken = 0;
async function speak(t, onEnd){
  if(!("speechSynthesis" in window)) return;
  const my = ++speakToken; try{ speechSynthesis.cancel(); }catch(e){}
  const v = await pickVoice(); if(my!==speakToken) return;
  const list = chunks(speakable(t));
  list.forEach((c,i)=>{ const u = new SpeechSynthesisUtterance(c); u.lang = "pt-BR"; if(v) u.voice = v; u.rate = voiceCfg.rate; u.pitch = 1;
    if(i===list.length-1 && onEnd) u.onend = onEnd; speechSynthesis.speak(u); });
}
function stopSpeak(){ speakToken++; try{ speechSynthesis.cancel(); }catch(e){} }
getVoices();

/* =============== MICROFONE: navegador ou reconhecimento no próprio celular =============== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = {state:"idle", rec:null, stream:null, media:null, chunks:[], ctx:null, raf:0, timer:0, worker:null, ready:false, stopAt:0, heard:false, silentSince:0, target:null};
function micUI(show, text, level){
  const box = $("#micBox"); if(!box) return;
  box.hidden = !show; if(text!=null) $("#micText").textContent = text;
  if(level!=null) $$("#micBars i").forEach((b,k)=>b.style.transform = `scaleY(${Math.max(.12, Math.min(1, level*(1.4 - Math.abs(k-3)*.25) ))})`);
}
function micFail(msg){ micUI(false); mic.state = "idle"; $$(".ask-mic").forEach(b=>b.classList.remove("rec")); if(!$("#chat").hidden) addMsg("bot", msg); else toast(msg); }
function cleanupRec(){ cancelAnimationFrame(mic.raf); clearTimeout(mic.timer); try{ mic.stream && mic.stream.getTracks().forEach(t=>t.stop()); }catch(e){} try{ mic.ctx && mic.ctx.close(); }catch(e){} mic.stream = mic.ctx = mic.media = null; }
async function startListening(target){
  if(mic.workerFailed && !mic.worker) mic.workerFailed = "";
  if(mic.state!=="idle"){ finishListening(); return; }
  stopSpeak(); mic.target = target; $$(".ask-mic").forEach(b=>b.classList.add("rec"));
  if(!$("#chat").hidden || target==="chat") micUI(true, "Ouvindo… fale sua pergunta", .2);
  const mode = store.get("wx_micmode") || "auto";
  if(SR && mode!=="local") nativeListen(); else localListen();
}
function nativeListen(){
  mic.state = "native"; let final = "", got = false;
  const r = new SR(); mic.rec = r; r.lang = "pt-BR"; r.interimResults = true; r.maxAlternatives = 1;
  r.onresult = ev=>{ let t=""; for(const res of ev.results){ t += res[0].transcript; if(res.isFinal) final = t; } got = true; micUI(true, `“${t}”`, .7); };
  r.onerror = ev=>{ mic.rec = null;
    if(ev.error==="not-allowed" || ev.error==="service-not-allowed"){ if(ev.error==="not-allowed"){ micFail("Preciso da permissão do microfone. Toque no cadeado ao lado do endereço e libere o microfone."); return; } }
    if(ev.error==="aborted") return;
    mic.state = "idle"; localListen();       // rede ruim ou serviço indisponível: usa o reconhecimento do próprio celular
  };
  r.onend = ()=>{ if(mic.state!=="native") return; mic.state = "idle"; micUI(false); $$(".ask-mic").forEach(b=>b.classList.remove("rec"));
    const t = (final || "").trim(); if(t) deliver(t); else if(!got) micFail("Não ouvi nada. Toque no microfone e fale perto do celular."); };
  try{ r.start(); }catch(e){ mic.state = "idle"; localListen(); }
}
async function localListen(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ micFail("Este navegador não libera o microfone para o app. Use o microfone do teclado do celular."); return; }
  if($("#chat").hidden){ openChat(null, false, true); }
  micUI(true, "Ouvindo… fale sua pergunta", .2);
  try{ mic.stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true}}); }
  catch(e){ micFail(e && e.name==="NotAllowedError" ? "O microfone está bloqueado para o app. Toque no cadeado ao lado do endereço (ou em Configurações › Apps › navegador › Permissões) e libere o microfone." : "Não consegui acessar o microfone do celular."); return; }
  mic.state = "rec"; mic.chunks = []; mic.heard = false; mic.silentSince = 0; mic.stopAt = Date.now() + 10000;
  loadWhisper();                                     // começa a preparar a transcrição enquanto você fala
  const type = ["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/webm","audio/mp4"].find(t=>window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  try{ mic.media = new MediaRecorder(mic.stream, type ? {mimeType:type} : undefined); }catch(e){ cleanupRec(); micFail("Este navegador não consegue gravar áudio."); return; }
  mic.media.ondataavailable = e=>{ if(e.data && e.data.size) mic.chunks.push(e.data); };
  mic.media.onstop = ()=>transcribe(new Blob(mic.chunks, {type: mic.media && mic.media.mimeType || type}));
  mic.media.start(250);
  mic.ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = mic.ctx.createMediaStreamSource(mic.stream), an = mic.ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize), t0 = Date.now();
  const loop = ()=>{ if(mic.state!=="rec") return; an.getFloatTimeDomainData(buf); let rms = 0; for(const x of buf) rms += x*x; rms = Math.sqrt(rms/buf.length); const lvl = Math.min(1, rms*8);
    micUI(true, mic.heard ? "Ouvindo… toque em Enviar quando terminar" : "Ouvindo… fale sua pergunta", lvl);
    if(rms > 0.035){ mic.heard = true; mic.silentSince = 0; } else if(mic.heard){ mic.silentSince = mic.silentSince || Date.now(); }
    if((mic.heard && mic.silentSince && Date.now()-mic.silentSince > 1300) || Date.now() > mic.stopAt || (!mic.heard && Date.now()-t0 > 7000)){ finishListening(); return; }
    mic.raf = requestAnimationFrame(loop); };
  loop();
}
function finishListening(){
  if(mic.state==="native"){ try{ mic.rec && mic.rec.stop(); }catch(e){} return; }
  if(mic.state!=="rec") return;
  mic.state = "busy"; cancelAnimationFrame(mic.raf); $$(".ask-mic").forEach(b=>b.classList.remove("rec"));
  if(!mic.heard){ try{ mic.media.onstop = null; mic.media.stop(); }catch(e){} cleanupRec(); micFail("Não ouvi nada. Toque no microfone e fale perto do celular."); return; }
  micUI(true, "Entendendo o que você falou…", .15);
  try{ mic.media.stop(); }catch(e){ cleanupRec(); micFail("Falha na gravação. Tente de novo."); }
}
function cancelListening(){ if(mic.state==="native"){ try{ mic.rec.abort(); }catch(e){} } if(mic.media){ mic.media.onstop = null; try{ mic.media.stop(); }catch(e){} } cleanupRec(); mic.state="idle"; micUI(false); $$(".ask-mic").forEach(b=>b.classList.remove("rec")); }
async function toPcm16k(blob){
  const ab = await blob.arrayBuffer(); const ac = new (window.AudioContext || window.webkitAudioContext)();
  const dec = await ac.decodeAudioData(ab); try{ ac.close(); }catch(e){}
  const len = Math.ceil(dec.duration * 16000), off = new OfflineAudioContext(1, len, 16000), s = off.createBufferSource(); s.buffer = dec; s.connect(off.destination); s.start();
  const out = await off.startRendering(); return out.getChannelData(0);
}
/* Whisper rodando no celular (num processo separado para não travar a tela) */
const WHISPER_MODEL = "onnx-community/whisper-base";

const dl = {};
function loadWhisper(){
  if(mic.worker) return mic.worker;
  mic.workerFailed = "";
  try{ mic.worker = new Worker(window.WX_ASR_WORKER || "vendor/asr-worker.js", {type:"module"}); }
  catch(e){ mic.worker = null; return null; }
  mic.worker.onmessage = e=>{ const m = e.data;
    if(m.type==="progress"){ dl[m.file] = m; const tot = Object.values(dl).reduce((a,b)=>a+b.total,0), got = Object.values(dl).reduce((a,b)=>a+b.loaded,0);
      if(!mic.ready && mic.state==="busy") micUI(true, `Preparando o reconhecimento de voz (só na primeira vez): ${Math.round(got/tot*100)}% de ${Math.round(tot/1048576)} MB`, .15); }
    if(m.type==="ready"){ mic.ready = true; store.set("wx_whisper", 1); }
    if(m.type==="text"){ mic.ready = true; mic.state = "idle"; micUI(false); if(m.text && !/^\[|^\(|^…$|^\.+$/.test(m.text)) deliver(m.text.replace(/^[\s"“]+|[\s"”]+$/g,"")); else micFail("Não entendi o que foi falado. Tente de novo, falando um pouco mais devagar."); }
    if(m.type==="error") workerFailed("Não consegui preparar o reconhecimento de voz agora. Na primeira vez ele precisa de internet para baixar. Enquanto isso, use o microfone do teclado do celular.");
  };
  mic.worker.onerror = ev=>{ ev && ev.preventDefault && ev.preventDefault(); workerFailed("Este navegador não conseguiu rodar o reconhecimento de voz. Use o microfone do teclado do celular."); };
  mic.worker.postMessage({type:"load", model: WHISPER_MODEL});
  return mic.worker;
}
function workerFailed(msg){
  try{ mic.worker && mic.worker.terminate(); }catch(e){} mic.worker = null; mic.workerFailed = msg;
  if(mic.state==="busy"){ mic.state = "idle"; micFail(msg); }      // só avisa se já estava esperando a transcrição; a gravação continua
}
async function transcribe(blob){
  cleanupRec();
  try{ const pcm = await toPcm16k(blob); if(pcm.length < 16000*0.4){ micFail("A gravação ficou curta demais. Segure e fale a pergunta inteira."); return; }
    if(mic.workerFailed && !mic.worker){ const msg = mic.workerFailed; mic.state = "idle"; micFail(msg); return; }
    const w = loadWhisper(); if(!w){ micFail("Este navegador não consegue reconhecer voz. Use o microfone do teclado do celular."); return; }
    if(!mic.ready) micUI(true, store.get("wx_whisper") ? "Entendendo o que você falou…" : "Preparando o reconhecimento de voz (só na primeira vez)…", .15);
    w.postMessage({type:"run", model: WHISPER_MODEL, audio:pcm}, [pcm.buffer]);
  }catch(e){ micFail("Não consegui ler o áudio gravado. Tente de novo."); }
}
function deliver(t){ $$(".ask-mic").forEach(b=>b.classList.remove("rec")); $("#askInput").value = ""; if($("#chat").hidden) openChat(t, true); else sendQ(t, true); }
$("#micDone").addEventListener("click", ()=>finishListening());
$("#micCancel").addEventListener("click", ()=>{ cancelListening(); });
$("#askMic").addEventListener("click", ()=>{ if(mic.state!=="idle"){ finishListening(); return; } openChat(null, false, true); startListening("chat"); });
$("#chatMic").addEventListener("click", ()=>{ if(mic.state!=="idle") finishListening(); else startListening("chat"); });

/* imagens externas que falham somem sem precisar de código dentro do HTML */
document.addEventListener("error", e=>{ const t = e.target; if(t && t.tagName==="IMG" && t.hasAttribute("data-rm")) t.remove(); }, true);
/* =============== início =============== */
$("#btnGps").addEventListener("click", ()=>getGps(true));
$("#btnRefresh").addEventListener("click", ()=>refreshIfStale(true));
const tab=store.get("wx_tab"); if(tab){ state.chartKey=tab; $$(".tab").forEach(x=>x.setAttribute("aria-selected",x.dataset.k===tab)); }
refreshNotifUI();
const savedLoc = store.get("wx_loc");
if(savedLoc){ state.loc=savedLoc; renderPlace(); restoreBundle(); }
const startView = (location.hash||"").slice(1); if(["agora","graficos","campo","noticias","local"].includes(startView)) showView(startView);
if(!savedLoc || savedLoc.fallback) getGps(); else refreshIfStale();
setInterval(()=>{ if(!document.hidden) refreshIfStale(); }, 5*60*1000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshIfStale(); });
setTimeout(()=>loadNews(), 4000);
/* mensagem do service worker ao tocar numa notificação com o app já aberto */
if(hasSW) navigator.serviceWorker.addEventListener("message", e=>{ if(e.data && e.data.type==="open") showView(e.data.view||"agora"); });
if(hasSW) navigator.serviceWorker.register("sw.js").then(reg=>{ syncWorker(); registerBackground(); refreshNotifUI(); watchUpdates(reg); }).catch(()=>{});
if(!hasSW) $("#bgState").textContent = "Aberto como arquivo: notificações exigem o app instalado por um link https.";
