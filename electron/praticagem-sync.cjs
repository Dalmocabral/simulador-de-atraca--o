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
  return b.includes("TECONTPROLONG") || b.includes("TECONT1");
}

/**
 * Tenta executar sincronização online da Praticagem RJ.
 * Escreve os dados em dataDir (normalmente app.getPath("userData")).
 */
async function syncPraticagem(dataDir, rootDir, onProgress) {
  if (onProgress) onProgress("Buscando dados na Praticagem RJ...", 40);

  const livePath = path.join(dataDir, "praticagem_live.json");
  const catalogPath = path.join(dataDir, "vessels_catalog.json");
  const pythonScript = path.join(rootDir, "scripts", "sync_praticagem.py");
  const venvPython = "D:\\Programação\\praticagem_dashboard\\scraper\\venv\\Scripts\\python.exe";
  const pythonExe = fs.existsSync(venvPython) ? `"${venvPython}"` : "python";

  // 1. Tentar rodar via Python se o script existir
  if (fs.existsSync(pythonScript)) {
    try {
      const pythonPromise = new Promise((resolve) => {
        exec(`${pythonExe} "${pythonScript}"`, { timeout: 12000 }, (err) => {
          if (err) {
            console.warn("[Praticagem Sync] Aviso ao rodar script Python:", err.message);
            resolve(false);
          } else {
            console.log("[Praticagem Sync] Sincronização via Python concluída.");
            // Copiar se o script gerou na pasta do projeto
            const bundledLive = path.join(rootDir, "client", "public", "praticagem_live.json");
            if (fs.existsSync(bundledLive) && bundledLive !== livePath) {
              try { fs.copyFileSync(bundledLive, livePath); } catch {}
            }
            resolve(true);
          }
        });
      });

      const success = await pythonPromise;
      if (success) {
        if (onProgress) onProgress("Manobras sincronizadas com sucesso!", 85);
        return { success: true };
      }
    } catch (e) {
      console.warn("[Praticagem Sync] Tentando modo nativo...", e);
    }
  }

  // 2. Se o Python não estiver disponível, faz raspagem nativa via HTTP
  if (onProgress) onProgress("Consultando portal da Praticagem RJ...", 55);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://www.praticagem-rj.com.br/", {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const html = await response.text();
      const regexRow = /<tr[^>]*id=["']trManobraArea[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
      const maneuvers = [];
      let match;

      while ((match = regexRow.exec(html)) !== null) {
        const rowContent = match[1];
        const cellRegex = /<td[^>]*class=["']tdManobraArea[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const text = cellMatch[1].replace(/<[^>]+>/g, "").trim();
          cells.push(text);
        }

        if (cells.length >= 12) {
          const becoOrigem = cells[8] || "";
          const becoDestino = cells[11] || "";
          const manobra = cells[7] || "";
          const combined = `${becoOrigem} ${becoDestino}`.toUpperCase();

          if (isTerminalBerth(becoDestino) || (manobra === "E" && isTerminalBerth(combined))) {
            const rawName = cells[1] || "";
            const cleanName = rawName.split("\n")[0].trim().toUpperCase();
            const loa = toFloat(cells[3] || "");
            const beam = toFloat(cells[4] || "");
            const draft = toFloat(cells[10] || cells[2] || "");
            const sideRaw = (cells[12] || "").toUpperCase();
            const side = sideRaw.includes("BB") ? "bombordo" : "boreste";

            if (cleanName) {
              maneuvers.push({
                name: cleanName,
                maneuver: manobra,
                date: cells[5] || "",
                time: cells[6] || "",
                berthFrom: becoOrigem,
                berthTo: becoDestino,
                loa: loa > 0 ? loa : 260.0,
                beam: beam > 0 ? beam : 32.0,
                draft: draft > 0 ? draft : 11.0,
                berthingSide: side,
                imo: cells[0] || "",
                type: "CONTAINER SHIP",
              });
            }
          }
        }
      }

      if (maneuvers.length > 0) {
        const now = new Date();
        const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const liveData = {
          updatedAt: dateStr,
          count: maneuvers.length,
          maneuvers: maneuvers,
        };

        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(livePath, JSON.stringify(liveData, null, 2), "utf-8");
        console.log(`[Praticagem Sync] ${maneuvers.length} manobras salvas nativamente em ${livePath}`);

        // Salva e enriquece automaticamente o catálogo permanente de navios
        let catalog = [];
        if (fs.existsSync(catalogPath)) {
          try {
            catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
          } catch {}
        }

        let catalogUpdated = false;
        for (const m of maneuvers) {
          if (!m.name) continue;
          const idx = catalog.findIndex((v) => v.name.toUpperCase() === m.name.toUpperCase());
          if (idx >= 0) {
            if (m.loa > 0) catalog[idx].loa = m.loa;
            if (m.beam > 0) catalog[idx].beam = m.beam;
            if (m.draft > 0) catalog[idx].draft = m.draft;
            if (m.berthingSide) catalog[idx].berthingSide = m.berthingSide;
            if (m.berthTo) catalog[idx].lastBerth = m.berthTo;
            catalog[idx].updatedAt = dateStr;
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
              updatedAt: dateStr,
            });
            catalogUpdated = true;
          }
        }

        if (catalogUpdated) {
          fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");
          console.log(`[Praticagem Sync] Catálogo permanente atualizado com ${catalog.length} navios em ${catalogPath}`);
        }
      }
    }
  } catch (err) {
    console.warn("[Praticagem Sync] Offline ou tempo limite atingido. Usando cache:", err.message);
  }

  if (onProgress) onProgress("Carregando plano de atracação...", 85);
  return { success: true };
}

module.exports = {
  syncPraticagem,
};
