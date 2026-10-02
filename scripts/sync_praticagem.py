#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de sincronização de manobras da Praticagem RJ e catálogo permanente de navios.
Filtra estritamente os navios que vão ATRACAR no Terminal (TECONTPROLONG e TECONT1 / Tecon Rio).
Conecta em https://www.praticagem-rj.com.br/ e cruza com D:/Programação/praticagem_dashboard/public/data.json
Gera:
- client/public/praticagem_live.json (manobras de atracação no terminal em tempo real)
- client/public/vessels_catalog.json (catálogo permanente dos navios do terminal)
"""

import sys
import os
import json
import re
from datetime import datetime

# Assegurar saída UTF-8 no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("ERRO: requests e beautifulsoup4 são necessários.", file=sys.stderr)
    sys.exit(1)

def to_float(val):
    if not val:
        return 0.0
    try:
        clean = str(val).replace(",", ".").strip()
        m = re.search(r"[-+]?\d*\.?\d+", clean)
        return float(m.group(0)) if m else 0.0
    except Exception:
        return 0.0

def run_sync():
    workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_dir = os.path.join(workspace_root, "client", "public")
    os.makedirs(public_dir, exist_ok=True)
    catalog_path = os.path.join(public_dir, "vessels_catalog.json")
    live_path = os.path.join(public_dir, "praticagem_live.json")

    # 1. Carregar catálogo existente
    catalog = {}
    if os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                for v in saved:
                    if v.get("name"):
                        catalog[v["name"].strip().upper()] = v
        except Exception as e:
            print(f"Aviso ao carregar catálogo: {e}", file=sys.stderr)

    # 2. Carregar navios de praticagem_dashboard local (apenas terminal Rio)
    dash_path = r"D:\Programação\praticagem_dashboard\public\data.json"
    if os.path.exists(dash_path):
        try:
            with open(dash_path, "r", encoding="utf-8") as f:
                dash_data = json.load(f)
                dash_navios = dash_data.get("navios", [])
                for n in dash_navios:
                    # Filtra apenas navios do terminal rio que vão atracar (ou seja, terminal rio)
                    terminal = n.get("terminal", "")
                    beco = n.get("beco", "")
                    if terminal == "rio" or "TECONTPROLONG" in beco or "TECONT1" in beco:
                        name = n.get("navio", "").strip().upper()
                        if not name:
                            continue
                        draft = to_float(n.get("calado", ""))
                        imo = str(n.get("imo") or "")
                        tipo = n.get("tipo_navio") or "CONTAINER SHIP"
                        if name not in catalog:
                            catalog[name] = {
                                "name": name,
                                "loa": 300.0 if "CONTAINER" in tipo.upper() else 220.0,
                                "beam": 48.0 if "CONTAINER" in tipo.upper() else 32.0,
                                "draft": draft if draft > 0 else 12.0,
                                "berthingSide": "boreste",
                                "imo": imo,
                                "type": tipo,
                                "flag": "",
                                "lastBerth": beco,
                                "updatedAt": datetime.now().strftime("%d/%m/%Y %H:%M"),
                            }
                        else:
                            if draft > 0:
                                catalog[name]["draft"] = draft
                            if imo:
                                catalog[name]["imo"] = imo
                            if tipo:
                                catalog[name]["type"] = tipo
                            if beco:
                                catalog[name]["lastBerth"] = beco
        except Exception as e:
            print(f"Aviso ao ler praticagem_dashboard: {e}", file=sys.stderr)

    # 3. Scraping da Praticagem RJ ao vivo filtrando estritamente ATRACAÇÃO NO TERMINAL RIO
    live_maneuvers = []
    seen_keys = set()
    url = "https://www.praticagem-rj.com.br/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        res = requests.get(url, headers=headers, timeout=12)
        res.encoding = res.apparent_encoding
        soup = BeautifulSoup(res.text, "lxml")
        rows = soup.find_all("tr", id=re.compile(r"trManobraArea"))

        for row in rows:
            cols = row.find_all("td", class_="tdManobraArea")
            if len(cols) >= 12:
                beco_origem = cols[8].get_text(strip=True) if len(cols) > 8 else ""
                beco_destino = cols[11].get_text(strip=True) if len(cols) > 11 else ""
                manobra = cols[7].get_text(strip=True)

                becos_combined = f"{beco_origem} {beco_destino}".upper()
                is_terminal_rio = "TECONTPROLONG" in becos_combined or "TECONT1" in becos_combined

                # Filtro: Pertence ao Terminal Rio e é manobra de ATRACAÇÃO (Entrada 'E' ou berço destino no terminal)
                is_berthing = (manobra == "E") or ("TECONTPROLONG" in beco_destino or "TECONT1" in beco_destino)

                if not (is_terminal_rio and is_berthing):
                    continue

                # Extrai nome limpo do navio
                name_div = cols[1].find("div", class_="tooltipDiv")
                raw_name = name_div.contents[0].strip() if name_div and name_div.contents else cols[1].get_text(strip=True)
                name_clean = raw_name.strip().upper()

                date_time = cols[0].get_text(strip=True)
                dedup_key = (name_clean, date_time, manobra, beco_destino or beco_origem)
                if dedup_key in seen_keys:
                    continue
                seen_keys.add(dedup_key)

                # Tooltip com dimensões técnicas oficiais
                tip = row.find("div", class_="tooltipDivEscondida")
                loa, boca, imo, tipo, bandeira = "", "", "", "", ""
                if tip:
                    def get_span(span_id):
                        el = tip.find("span", id=span_id)
                        return el.get_text(strip=True) if el else ""
                    loa = get_span("DC_COMPRIMENTO")
                    boca = get_span("DC_BOCA")
                    imo = get_span("ST_NR_IMO")
                    tipo = get_span("DS_TIPO_NAVIO")
                    bandeira = get_span("DS_BANDEIRA")

                n_loa = to_float(loa or (cols[3].get_text(strip=True) if len(cols) > 3 else ""))
                n_beam = to_float(boca or (cols[4].get_text(strip=True) if len(cols) > 4 else ""))
                n_draft = to_float(cols[2].get_text(strip=True) if len(cols) > 2 else "")
                side_raw = (cols[12].get_text(strip=True) if len(cols) > 12 else "").upper()
                side = "boreste" if "BE" in side_raw else ("bombordo" if "BB" in side_raw else "boreste")

                destination_berth = beco_destino if beco_destino else beco_origem

                m_data = {
                    "dateTime": date_time,
                    "name": name_clean,
                    "draft": n_draft,
                    "loa": n_loa,
                    "beam": n_beam,
                    "maneuver": manobra,
                    "berthFrom": beco_origem,
                    "berthTo": destination_berth,
                    "berthingSide": side,
                    "imo": imo,
                    "type": tipo or "CONTAINER SHIP",
                    "flag": bandeira,
                    "terminal": "rio",
                }
                live_maneuvers.append(m_data)

                # Salva no catálogo permanente
                if name_clean and n_loa > 0:
                    catalog[name_clean] = {
                        "name": name_clean,
                        "loa": n_loa,
                        "beam": n_beam,
                        "draft": n_draft if n_draft > 0 else (catalog.get(name_clean, {}).get("draft") or 11.0),
                        "berthingSide": side,
                        "imo": imo or catalog.get(name_clean, {}).get("imo") or "",
                        "type": tipo or catalog.get(name_clean, {}).get("type") or "CONTAINER SHIP",
                        "flag": bandeira or catalog.get(name_clean, {}).get("flag") or "",
                        "lastBerth": destination_berth,
                        "updatedAt": datetime.now().strftime("%d/%m/%Y %H:%M"),
                    }
    except Exception as e:
        print(f"Erro ao acessar site da Praticagem RJ: {e}", file=sys.stderr)

    # 4. Salvar praticagem_live.json
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    with open(live_path, "w", encoding="utf-8") as f:
        json.dump({
            "updatedAt": now_str,
            "terminal": "Tecon Rio (Prolongamento / Tecon 1)",
            "count": len(live_maneuvers),
            "maneuvers": live_maneuvers
        }, f, ensure_ascii=False, indent=2)

    # 5. Salvar vessels_catalog.json
    sorted_catalog = sorted(list(catalog.values()), key=lambda x: x["name"])
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(sorted_catalog, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "status": "success",
        "terminal": "rio",
        "maneuversCount": len(live_maneuvers),
        "catalogCount": len(sorted_catalog),
        "updatedAt": now_str
    }))

if __name__ == "__main__":
    run_sync()
