#!/usr/bin/env python3
"""Robô gratuito do Radar Brasil (roda no GitHub Actions, sem IA).

Atualiza em dados.json só o que tem fonte oficial ou de mercado:
  - indicadores.itens  <- Banco Central (SGS): Selic, CDI, IPCA mês/12m, IGP-M, poupança, desemprego
  - mercado.moedas     <- AwesomeAPI, com Yahoo Finance e PTAX do Banco Central como reservas
  - mercado.ibov/acoes <- Yahoo Finance (B3), com brapi como reserva
  - noticias           <- Google Notícias (RSS), só quando houver notícias novas
Cada número passa por conferência de faixa. Se uma fonte falhar ou trouxer valor estranho,
o valor anterior é mantido e o problema fica registrado em dados.json -> "robo".

Uso: python3 tools/robo.py            (atualiza dados.json)
     python3 tools/robo.py --teste    (roda com respostas simuladas, sem internet, e não grava)
"""
import json, os, sys, datetime, urllib.request, urllib.parse, xml.etree.ElementTree as ET

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(BASE, "dados.json")
UA = {"User-Agent": "Mozilla/5.0 (RadarBrasil robo; +https://eliabeanger.github.io/tempo_agora/radar/)"}
BRT = datetime.timezone(datetime.timedelta(hours=-3))
TESTE = "--teste" in sys.argv
SIMULADO = {}  # url -> resposta (preenchido no modo teste)

def agora():
    return datetime.datetime.now(BRT)

def baixar(url, tipo="json", tentativas=2):
    if TESTE:
        for chave, resp in SIMULADO.items():
            if chave in url:
                return resp
        raise RuntimeError("sem simulação para " + url)
    erro = None
    for _ in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                txt = r.read().decode("utf-8", "replace")
            return json.loads(txt) if tipo == "json" else txt
        except Exception as e:
            erro = e
    raise RuntimeError(f"{url[:70]}…: {erro}")

def na_faixa(v, lo, hi):
    return isinstance(v, (int, float)) and lo <= v <= hi

# ---------------- Banco Central ----------------
SERIES = {  # id: (código SGS, faixa aceitável)
    "selic": (432, (1, 40)), "cdi": (4389, (1, 40)), "ipca12": (13522, (-5, 40)),
    "ipcam": (433, (-3, 5)), "igpm": (189, (-6, 8)), "poup": (195, (0, 3)), "desemp": (24369, (1, 30)),
}

def banco_central(d, log):
    itens = d.setdefault("indicadores", {}).setdefault("itens", {})
    for k, (cod, (lo, hi)) in SERIES.items():
        try:
            j = baixar(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados/ultimos/1?formato=json")
            v = float(str(j[-1]["valor"]).replace(",", "."))
            if not na_faixa(v, lo, hi):
                raise ValueError(f"valor fora da faixa ({v})")
            itens[k] = {"valor": v, "data": j[-1]["data"], "fonte": "Banco Central"}
            log["ok"].append(f"BC {k}")
        except Exception as e:
            log["falhas"].append(f"BC {k}: {e}")

def ptax(log):
    try:
        j = baixar("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json")
        return float(j[-1]["valor"])
    except Exception as e:
        log["falhas"].append(f"PTAX: {e}")
        return None

# ---------------- Câmbio ----------------
# Fontes em ordem: AwesomeAPI -> Yahoo Finance -> PTAX do Banco Central.
# A AwesomeAPI costuma bloquear (HTTP 429) os servidores do GitHub, por isso as reservas.
def cambio_awesome():
    j = baixar("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL", tentativas=1)
    return {"USD": (float(j["USDBRL"]["bid"]), float(j["USDBRL"]["pctChange"])),
            "EUR": (float(j["EURBRL"]["bid"]), float(j["EURBRL"]["pctChange"]))}

def cambio_yahoo():
    u, e = yahoo("BRL=X"), yahoo("EURBRL=X")
    return {"USD": (u["preco"], u["var"]), "EUR": (e["preco"], e["var"])}

def cambio_ptax():
    out = {}
    for sig, cod in (("USD", 1), ("EUR", 21619)):
        j = baixar(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados/ultimos/2?formato=json")
        v = float(j[-1]["valor"]); ant = float(j[-2]["valor"]) if len(j) > 1 else v
        out[sig] = (v, (v / ant - 1) * 100)
    return out

def cambio(d, log):
    m = d.setdefault("mercado", {})
    p = None
    for nome, f in (("AwesomeAPI", cambio_awesome), ("Yahoo", cambio_yahoo), ("PTAX", cambio_ptax)):
        try:
            c = f()
            (usd, vu), (eur, ve) = c["USD"], c["EUR"]
            if not (na_faixa(usd, 3, 10) and na_faixa(eur, 3, 12) and abs(vu) < 15 and abs(ve) < 15):
                raise ValueError(f"cotação estranha USD {usd} EUR {eur}")
            if nome != "PTAX":
                p = p or ptax(log)  # conferência cruzada com o Banco Central
                if p and abs(usd / p - 1) > 0.08:
                    raise ValueError(f"dólar {usd} muito longe da PTAX {p}")
            agora_br = agora()
            m["moedas"] = [
                {"sigla": "USD", "nome": "Dólar Americano", "valor": round(usd, 4), "var": round(vu, 2)},
                {"sigla": "EUR", "nome": "Euro", "valor": round(eur, 4), "var": round(ve, 2)},
            ]
            m["moedasTs"] = int(agora_br.timestamp() * 1000)
            m["moedasFonte"] = nome
            log["ok"].append(f"câmbio ({nome})")
            return
        except Exception as e:
            log["falhas"].append(f"câmbio {nome}: {str(e)[:120]}")
    log["falhas"].append("câmbio: todas as fontes falharam, mantido o valor anterior")

# ---------------- Bolsa ----------------
ACOES = ["PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "WEGE3", "SUZB3", "B3SA3"]

def yahoo(simbolo):
    j = baixar("https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(simbolo) + "?range=1d&interval=1d")
    meta = j["chart"]["result"][0]["meta"]
    preco = float(meta["regularMarketPrice"])
    ant = float(meta.get("chartPreviousClose") or meta.get("previousClose"))
    return {"preco": preco, "ant": ant, "var": (preco / ant - 1) * 100,
            "min": meta.get("regularMarketDayLow"), "max": meta.get("regularMarketDayHigh"),
            "ts": meta.get("regularMarketTime")}

def brapi(simbolo):
    tok = os.environ.get("BRAPI_TOKEN", "")
    j = baixar(f"https://brapi.dev/api/quote/{urllib.parse.quote(simbolo)}" + (f"?token={tok}" if tok else ""))
    x = j["results"][0]
    return {"preco": float(x["regularMarketPrice"]), "ant": float(x["regularMarketPreviousClose"]),
            "var": float(x["regularMarketChangePercent"]), "min": x.get("regularMarketDayLow"),
            "max": x.get("regularMarketDayHigh"), "ts": None}

def cotacao(simbolo_yahoo, simbolo_brapi, log):
    for nome, f, s in (("Yahoo", yahoo, simbolo_yahoo), ("brapi", brapi, simbolo_brapi)):
        try:
            return f(s)
        except Exception as e:
            log["falhas"].append(f"{nome} {s}: {e}")
    return None

def bolsa(d, log):
    m = d.setdefault("mercado", {})
    agora_br = agora()
    ib = cotacao("^BVSP", "^BVSP", log)
    if ib and na_faixa(ib["preco"], 50000, 500000) and abs(ib["var"]) < 25:
        m["ibov"] = {"pontos": round(ib["preco"], 2), "var": round(ib["var"], 2), "anterior": round(ib["ant"], 2),
                     "minimo": round(float(ib["min"] or ib["preco"]), 2), "maximo": round(float(ib["max"] or ib["preco"]), 2),
                     "hora": agora_br.strftime("%d/%m %Hh%M"), "ts": int(agora_br.timestamp() * 1000)}
        log["ok"].append("Ibovespa")
    elif ib:
        log["falhas"].append(f"Ibovespa descartado (valor {ib['preco']}, var {ib['var']:.1f}%)")
    # atualiza ação por ação; a que falhar fica com o valor anterior
    anteriores = {a["ticker"]: a for a in m.get("acoes", [])}
    atualizadas = 0
    for t in ACOES:
        c = cotacao(t + ".SA", t, log)
        if not c:
            continue
        if na_faixa(c["preco"], 0.5, 2000) and abs(c["var"]) < 60:
            anteriores[t] = {"ticker": t, "preco": round(c["preco"], 2), "var": round(c["var"], 2)}
            atualizadas += 1
        else:
            log["falhas"].append(f"{t} descartada (preço {c['preco']}, var {c['var']:.1f}%)")
    m["acoes"] = [anteriores[t] for t in ACOES if t in anteriores]
    if atualizadas:
        m["acoesTs"] = int(agora_br.timestamp() * 1000)
        log["ok"].append(f"{atualizadas} de {len(ACOES)} ações")
    else:
        log["falhas"].append("nenhuma ação atualizada, mantidos os valores anteriores")

# ---------------- Notícias ----------------
GN = "https://news.google.com/rss/search?q={}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
FEEDS = {
    "economia": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "brasil": "https://news.google.com/rss/headlines/section/topic/NATION?hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "politica": GN.format(urllib.parse.quote("política Brasília Congresso when:1d")),
    "eleicoes": GN.format(urllib.parse.quote("Lula Flávio Bolsonaro eleição when:2d")),
}

def noticias(d, log):
    novas = []
    for cat, url in FEEDS.items():
        try:
            raiz = ET.fromstring(baixar(url, "text"))
            for it in raiz.iter("item"):
                titulo = (it.findtext("title") or "").strip()
                fonte = (it.findtext("source") or "").strip()
                if " - " in titulo and len(titulo.rsplit(" - ", 1)[0]) > 20:
                    titulo, f2 = titulo.rsplit(" - ", 1)
                    fonte = fonte or f2
                link = (it.findtext("link") or "").strip()
                if titulo and link.startswith("https://"):
                    novas.append({"cat": cat, "titulo": titulo, "fonte": fonte, "url": link})
                if sum(1 for n in novas if n["cat"] == cat) >= 3:
                    break
        except Exception as e:
            log["falhas"].append(f"notícias {cat}: {e}")
    if len(novas) >= 6:
        vistos, lista = set(), []
        for n in novas:
            if n["titulo"] not in vistos:
                vistos.add(n["titulo"]); lista.append(n)
        d["noticias"] = lista[:12]
        log["ok"].append(f"{len(d['noticias'])} notícias")
    else:
        log["falhas"].append("poucas notícias novas, mantidas as anteriores")

# ---------------- principal ----------------
def main():
    with open(DADOS, encoding="utf-8") as f:
        d = json.load(f)
    antes = json.dumps({k: d.get(k) for k in ("indicadores", "mercado", "noticias")}, sort_keys=True, ensure_ascii=False)
    log = {"ok": [], "falhas": []}
    banco_central(d, log)
    cambio(d, log)
    bolsa(d, log)
    noticias(d, log)
    depois = json.dumps({k: d.get(k) for k in ("indicadores", "mercado", "noticias")}, sort_keys=True, ensure_ascii=False)
    d["robo"] = {"atualizadoEm": agora().isoformat(timespec="seconds"), "ok": log["ok"], "falhas": log["falhas"][:20]}
    print("OK:", ", ".join(log["ok"]) or "nada")
    if log["falhas"]:
        print("Falhas (valor anterior mantido):"); [print(" -", f) for f in log["falhas"]]
    if TESTE:
        print(json.dumps({k: d.get(k) for k in ("indicadores", "mercado")}, ensure_ascii=False)[:900])
        return
    if antes == depois:
        print("Nenhum número mudou; dados.json não foi alterado.")
        return
    with open(DADOS, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print("dados.json atualizado.")

if __name__ == "__main__":
    if TESTE:
        ts = int(datetime.datetime.now().timestamp())
        def sgs(v): return [{"data": "01/10/2026", "valor": v}]
        SIMULADO.update({
            "sgs.432/": sgs("13.75"), "sgs.4389/": sgs("13.65"), "sgs.13522/": sgs("4.58"), "sgs.433/": sgs("0.82"),
            "sgs.189/": sgs("0.41"), "sgs.195/": sgs("0.6731"), "sgs.24369/": sgs("5.6"), "sgs.1/": sgs("5.5007"),
            # awesomeapi sem simulação = falha (como o HTTP 429 real); o Yahoo assume
            "EURBRL%3DX": {"chart": {"result": [{"meta": {"regularMarketPrice": 6.2201, "chartPreviousClose": 6.2302}}]}},
            "/BRL%3DX": {"chart": {"result": [{"meta": {"regularMarketPrice": 5.3412, "chartPreviousClose": 5.3478}}]}},
            "%5EBVSP": {"chart": {"result": [{"meta": {"regularMarketPrice": 175032.74, "chartPreviousClose": 205088.74, "regularMarketDayLow": 169500, "regularMarketDayHigh": 205000, "regularMarketTime": ts}}]}},
            "PETR4.SA": {"chart": {"result": [{"meta": {"regularMarketPrice": 30.1, "chartPreviousClose": 33.07}}]}},
            "VALE3.SA": {"chart": {"result": [{"meta": {"regularMarketPrice": 64.96, "chartPreviousClose": 62.3}}]}},
            "ITUB4.SA": {"chart": {"result": [{"meta": {"regularMarketPrice": 999999, "chartPreviousClose": 30}}]}},  # absurdo: deve ser descartado
        })
    main()
