#!/usr/bin/env python3
"""Fecha o dia do Radar Brasil.

Uso: python3 tools/arquivar.py [AAAA-MM-DD] [--sem-reset]

- Salva as histórias, o alerta e os números do dia em arquivo/AAAA-MM-DD.json
- Atualiza arquivo/indice.json (lista de dias, mais novo primeiro)
- Zera a lista "atualizacoes" de cada história em dados.json (o dia seguinte começa limpo),
  a menos que --sem-reset seja passado
Sem data, usa a data de hoje no horário de Brasília.
"""
import json, sys, os, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS = os.path.join(BASE, "dados.json")
PASTA = os.path.join(BASE, "arquivo")

def hoje_brasilia():
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)).date().isoformat()

def br(v, d=2):
    return f"{v:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")

def numeros(d):
    n = {}
    m = d.get("mercado", {})
    usd = next((x for x in m.get("moedas", []) if x.get("sigla") == "USD"), None)
    if usd: n["Dólar"] = "R$ " + br(usd["valor"], 3)
    ib = m.get("ibov")
    if ib: n["Ibovespa"] = br(ib["pontos"], 0) + f" pts ({'+' if ib['var'] >= 0 else ''}{br(ib['var'])}%)"
    ind = d.get("indicadores", {}).get("itens", {})
    if ind.get("selic"): n["Selic"] = br(ind["selic"]["valor"]) + "%"
    if ind.get("ipca12"): n["Inflação 12 meses"] = br(ind["ipca12"]["valor"]) + "%"
    for it in d.get("combustiveis", {}).get("itens", []):
        if it["nome"] in ("Gasolina", "Diesel S10"): n[it["nome"]] = "R$ " + br(it["valor"])
    return n

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dia = args[0] if args else hoje_brasilia()
    datetime.date.fromisoformat(dia)  # valida a data
    with open(DADOS, encoding="utf-8") as f:
        d = json.load(f)
    hs = d.get("historias", [])
    if not hs:
        sys.exit("dados.json não tem histórias para arquivar")
    os.makedirs(PASTA, exist_ok=True)
    snap = {"data": dia, "arquivadoEm": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "alerta": d.get("alerta", ""), "numeros": numeros(d), "historias": hs}
    with open(os.path.join(PASTA, dia + ".json"), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)
    ip = os.path.join(PASTA, "indice.json")
    indice = {"dias": []}
    if os.path.exists(ip):
        with open(ip, encoding="utf-8") as f:
            indice = json.load(f)
    dias = [x for x in indice.get("dias", []) if x.get("data") != dia]
    dias.append({"data": dia, "manchete": hs[0]["titulo"], "qtd": len(hs)})
    dias.sort(key=lambda x: x["data"], reverse=True)
    with open(ip, "w", encoding="utf-8") as f:
        json.dump({"dias": dias}, f, ensure_ascii=False, indent=2)
    if "--sem-reset" not in sys.argv:
        for h in hs:
            h["atualizacoes"] = []
        with open(DADOS, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"Dia {dia} arquivado com {len(hs)} histórias. Índice com {len(dias)} dias.")

if __name__ == "__main__":
    main()
