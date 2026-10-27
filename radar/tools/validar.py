#!/usr/bin/env python3
"""Confere se dados.json está no formato que o app espera. Sai com erro se algo estiver errado.
Uso: python3 tools/validar.py"""
import json, os, sys, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
erros = []
def erro(m): erros.append(m)

try:
    with open(os.path.join(BASE, "dados.json"), encoding="utf-8") as f:
        d = json.load(f)
except Exception as e:
    sys.exit(f"ERRO: dados.json não é um JSON válido: {e}")

def num(x): return isinstance(x, (int, float)) and not isinstance(x, bool)

for k in ["atualizadoEm", "eleicoes", "mercado", "combustiveis", "noticias", "indicadores", "historias", "economia"]:
    if k not in d: erro(f"falta a chave '{k}'")
try: datetime.datetime.fromisoformat(d.get("atualizadoEm", ""))
except Exception: erro("atualizadoEm deve ser data ISO com fuso, ex.: 2026-10-27T07:40:00-03:00")

m = d.get("mercado", {})
ib = m.get("ibov", {})
for k in ["pontos", "var", "anterior", "minimo"]:
    if not num(ib.get(k)): erro(f"mercado.ibov.{k} deve ser número")
for a in m.get("acoes", []):
    if not isinstance(a.get("ticker"), str) or not num(a.get("var")): erro(f"ação inválida: {a}")
for x in m.get("moedas", []):
    if not x.get("sigla") or not num(x.get("valor")): erro(f"moeda inválida: {x}")
for x in m.get("juros", []):
    if not num(x.get("taxa")) or not num(x.get("var")): erro(f"juros inválido: {x}")
for x in d.get("combustiveis", {}).get("itens", []):
    if not num(x.get("valor")) or not num(x.get("varAno")): erro(f"combustível inválido: {x}")
for k, v in d.get("indicadores", {}).get("itens", {}).items():
    if not num(v.get("valor")): erro(f"indicador {k} sem valor numérico")

hs = d.get("historias", [])
if not 1 <= len(hs) <= 8: erro("deve haver de 1 a 8 histórias")
ids = set()
for h in hs:
    hid = h.get("id", "?")
    if hid in ids: erro(f"id repetido: {hid}")
    ids.add(hid)
    for k in ["id", "tema", "titulo", "chamada", "data", "porque"]:
        if not isinstance(h.get(k), str) or not h.get(k).strip(): erro(f"história {hid}: '{k}' vazio")
    for k in ["inicio", "cadeia", "saidas"]:
        if not isinstance(h.get(k), list) or not h.get(k): erro(f"história {hid}: '{k}' deve ser lista com itens")
    if not 3 <= len(h.get("cadeia", [])) <= 7: erro(f"história {hid}: cadeia deve ter de 3 a 7 passos")
    for c in h.get("cenarios", []):
        if c.get("tipo") not in ("otimista", "base", "pessimista", "incerto"): erro(f"história {hid}: cenário com tipo inválido")
    if not h.get("fontes"): erro(f"história {hid}: precisa de fontes")
    for f in h.get("fontes", []):
        if not str(f.get("url", "")).startswith("https://"): erro(f"história {hid}: fonte sem https: {f}")
    for a in h.get("atualizacoes", []):
        if not a.get("hora") or not a.get("texto"): erro(f"história {hid}: atualização sem hora ou texto")
    if "indicadores" in h and not set(h["indicadores"]) <= {"dolar", "ibov", "selic", "ipca", "etanol"}:
        erro(f"história {hid}: indicadores só podem ser dolar, ibov, selic, ipca, etanol")
for n in d.get("noticias", []):
    if not str(n.get("url", "")).startswith("https://"): erro(f"notícia sem https: {n.get('titulo')}")

if erros:
    print("ERROS em dados.json:"); [print(" -", e) for e in erros]; sys.exit(1)
print(f"dados.json OK: {len(hs)} histórias, {len(d.get('noticias', []))} notícias.")
