const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

function toFloat(val) {
  if (!val) return 0.0;
  try {
    const clean = String(val).replace(",", ".").trim();
    const m = clean.match(/[-+]?\d*\.?\d+/);
    return m ? parseFloat(m[0]) : 0.0;
  } catch {
    return 0.0;
  }
}

function isTerminalBerth(berth) {
  if (!berth) return false;
  const b = String(berth).trim().toUpperCase();
  return b.includes("TECONTPROLONG") || b.includes("TECONT1") || b.includes("TECON 1") || b.includes("PROLONG");
}

/**
 * Raspador nativo direto de https://www.praticagem-rj.com.br/
 * Independe de Python, virtualenv ou bibliotecas externas.
 */
async function scrapePraticagemNative(onProgress) {
  if (onProgress) onProgress("Consultando portal oficial da Praticagem RJ...", 50);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const res = await fetch("https://www.praticagem-rj.com.br/", {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  clearTimeout(timeout);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();

  // Divide pelas linhas trManobraArea de forma resiliente a ASP.NET e tabelas aninhadas
  const rowChunks = html.split(/<tr[^>]*id=["'][^"']*trManobraArea[^"']*["'][^>]*>/i).slice(1);
  const maneuvers = [];
  const seenKeys = new Set();

  for (let i = 0; i < rowChunks.length; i++) {
    const rawChunk = rowChunks[i];
    const endIdx = rawChunk.search(/<\/tr>\s*(?=<tr|<\/tbody|<\/table)/i);
    const rowContent = endIdx !== -1 ? rawChunk.slice(0, endIdx) : rawChunk;

    // Extrair especificações técnicas da tooltip se disponíveis
    const getSpan = (spanId) => {
      const m = rowContent.match(new RegExp(`id=["']${spanId}["'][^>]*>([^<]+)<`, "i"));
      return m ? m[1].trim() : "";
    };

    const tipName = getSpan("NM_NAVIO");
    const tipLoa = toFloat(getSpan("DC_COMPRIMENTO"));
    const tipBeam = toFloat(getSpan("DC_BOCA"));
    const tipType = getSpan("DS_TIPO_NAVIO");
    const tipImo = getSpan("ST_NR_IMO");
    const tipFlag = getSpan("DS_BANDEIRA");

    // Limpar o tooltip aninhado antes de extrair as células <td>
    const cleanRow = rowContent.replace(
      /<div\s+class=['"]tooltipDivEscondida['"][\s\S]*?<\/div>\s*<\/span>\s*<\/div>/gi,
      ""
    );

    // Extrair células tdManobraArea
    const tdMatches =
      cleanRow.match(/<td[^>]*class=["'][^"']*tdManobraArea[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi) || [];
    const cells = tdMatches.map((td) => td.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

    if (cells.length >= 12) {
      const becoOrigem = cells[8] || "";
      const becoDestino = cells[11] || "";
      const manobra = cells[7] || "";
      const becosCombined = `${becoOrigem} ${becoDestino}`.toUpperCase();

      // Regra da Praticagem: navios que vão atracar no terminal
      if (manobra === "S" && !isTerminalBerth(becoDestino)) {
        continue;
      }

      const isBerthing = isTerminalBerth(becoDestino) || (manobra === "E" && isTerminalBerth(becosCombined));
      if (!isBerthing) {
        continue;
      }

      const rawName = tipName || cells[1] || "";
      const cleanName = rawName.split("\n")[0].trim().toUpperCase();
      const dateTime = cells[0] || "";

      const dedupKey = `${cleanName}_${dateTime}_${manobra}_${becoDestino || becoOrigem}`;
      if (seenKeys.has(dedupKey)) {
        continue;
      }
      seenKeys.add(dedupKey);

      const loa = tipLoa > 0 ? tipLoa : toFloat(cells[3] || "");
      const beam = tipBeam > 0 ? tipBeam : toFloat(cells[4] || "");
      const draft = toFloat(cells[2] || "");
      const sideRaw = (cells[12] || "").toUpperCase();
      const side = sideRaw.includes("BB") ? "bombordo" : "boreste";

      maneuvers.push({
        dateTime,
        name: cleanName,
        draft: draft > 0 ? draft : 11.0,
        loa: loa > 0 ? loa : 260.0,
        beam: beam > 0 ? beam : 32.0,
        maneuver: manobra,
        berthFrom: becoOrigem,
        berthTo: becoDestino || becoOrigem,
        berthingSide: side,
        imo: tipImo || "",
        type: tipType || "CONTAINER SHIP",
        flag: tipFlag || "",
        terminal: "rio",
      });
    }
  }

  const now = new Date();
  const dateStr =
    now.toLocaleDateString("pt-BR") +
    " " +
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return {
    updatedAt: dateStr,
    terminal: "Tecon Rio (Prolongamento / Tecon 1)",
    count: maneuvers.length,
    maneuvers,
  };
}

/**
 * Sincroniza manobras da Praticagem RJ e atualiza o catálogo de navios.
 * @param {string} dataDir Diretório gravável de dados da aplicação (userData).
 * @param {string} rootDir Raiz do projeto.
 * @param {Function} [onProgress] Callback de progresso.
 */
async function syncPraticagem(dataDir, rootDir, onProgress) {
  if (onProgress) onProgress("Buscando dados na Praticagem RJ...", 35);

  const livePath = path.join(dataDir, "praticagem_live.json");
  const catalogPath = path.join(dataDir, "vessels_catalog.json");
  const publicDir = rootDir ? path.join(rootDir, "client", "public") : null;

  let liveData = null;

  // 1. Raspagem nativa direta (alta performance e zero dependências de Python)
  try {
    liveData = await scrapePraticagemNative(onProgress);
    console.log(`[Praticagem Sync] Raspagem nativa concluída: ${liveData.count} manobras obtidas.`);
  } catch (nativeErr) {
    console.warn("[Praticagem Sync] Aviso na raspagem nativa:", nativeErr.message);

    // 2. Se a raspagem nativa falhar, tenta via Python como plano B (se disponível na máquina de desenvolvimento)
    const pythonScript = rootDir ? path.join(rootDir, "scripts", "sync_praticagem.py") : null;
    const venvPython = "D:\\Programação\\praticagem_dashboard\\scraper\\venv\\Scripts\\python.exe";
    const pythonExe = fs.existsSync(venvPython) ? `"${venvPython}"` : "python";

    if (pythonScript && fs.existsSync(pythonScript)) {
      try {
        if (onProgress) onProgress("Tentando sincronizador auxiliar...", 60);
        await new Promise((resolve) => {
          exec(`${pythonExe} "${pythonScript}"`, { timeout: 12000 }, (err) => {
            if (err) {
              console.warn("[Praticagem Sync] Python auxiliar também falhou:", err.message);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        });

        // Ler arquivo gerado na pasta public se existir
        if (publicDir) {
          const publicLive = path.join(publicDir, "praticagem_live.json");
          if (fs.existsSync(publicLive)) {
            liveData = JSON.parse(fs.readFileSync(publicLive, "utf-8"));
          }
        }
      } catch (pyErr) {
        console.warn("[Praticagem Sync] Erro no fallback Python:", pyErr.message);
      }
    }
  }

  // 3. Salvar os dados atualizados
  if (liveData && liveData.maneuvers) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(livePath, JSON.stringify(liveData, null, 2), "utf-8");
      console.log(`[Praticagem Sync] Arquivo atualizado em ${livePath}`);

      // Salva também no client/public se for gravável (em dev)
      if (publicDir && fs.existsSync(publicDir)) {
        try {
          fs.writeFileSync(path.join(publicDir, "praticagem_live.json"), JSON.stringify(liveData, null, 2), "utf-8");
        } catch {}
      }

      // Enriquecer catálogo permanente de navios
      let catalog = [];
      if (fs.existsSync(catalogPath)) {
        try {
          catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
        } catch {}
      } else if (publicDir && fs.existsSync(path.join(publicDir, "vessels_catalog.json"))) {
        try {
          catalog = JSON.parse(fs.readFileSync(path.join(publicDir, "vessels_catalog.json"), "utf-8"));
        } catch {}
      }

      let catalogUpdated = false;
      const nowStr = liveData.updatedAt || new Date().toLocaleString("pt-BR");

      for (const m of liveData.maneuvers) {
        if (!m.name) continue;
        const idx = catalog.findIndex((v) => v.name.toUpperCase() === m.name.toUpperCase());
        if (idx >= 0) {
          if (m.loa > 0) catalog[idx].loa = m.loa;
          if (m.beam > 0) catalog[idx].beam = m.beam;
          if (m.draft > 0) catalog[idx].draft = m.draft;
          if (m.berthingSide) catalog[idx].berthingSide = m.berthingSide;
          if (m.berthTo) catalog[idx].lastBerth = m.berthTo;
          if (m.type) catalog[idx].type = m.type;
          catalog[idx].updatedAt = nowStr;
          catalogUpdated = true;
        } else {
          catalog.push({
            name: m.name,
            loa: m.loa > 0 ? m.loa : 260.0,
            beam: m.beam > 0 ? m.beam : 32.0,
            draft: m.draft > 0 ? m.draft : 11.0,
            berthingSide: m.berthingSide || "boreste",
            imo: m.imo || "",
            type: m.type || "CONTAINER SHIP",
            lastBerth: m.berthTo || "TECONTPROLONG",
            updatedAt: nowStr,
          });
          catalogUpdated = true;
        }
      }

      if (catalogUpdated) {
        fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");
        if (publicDir && fs.existsSync(publicDir)) {
          try {
            fs.writeFileSync(path.join(publicDir, "vessels_catalog.json"), JSON.stringify(catalog, null, 2), "utf-8");
          } catch {}
        }
        console.log(`[Praticagem Sync] Catálogo permanente atualizado com ${catalog.length} navios.`);
      }

      if (onProgress) onProgress("Manobras sincronizadas com sucesso!", 90);
      return { success: true, count: liveData.count };
    } catch (saveErr) {
      console.error("[Praticagem Sync] Erro ao salvar dados:", saveErr);
    }
  } else {
    console.warn("[Praticagem Sync] Nenhuma nova manobra recebida. Mantendo cache local.");
  }

  if (onProgress) onProgress("Carregando plano de atracação...", 90);
  return { success: true, count: 0 };
}

module.exports = {
  syncPraticagem,
  scrapePraticagemNative,
};
