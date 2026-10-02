export interface CatalogVessel {
  name: string;
  loa: number;
  beam: number;
  draft: number;
  berthingSide: "boreste" | "bombordo";
  imo?: string;
  type?: string;
  flag?: string;
  lastBerth?: string;
  updatedAt?: string;
}

export interface PraticagemManeuver {
  dateTime: string;
  name: string;
  draft: number;
  loa: number;
  beam: number;
  maneuver: string; // 'E' = Entrada, 'S' = Saída, 'M' = Mudança
  berthFrom: string;
  berthTo: string;
  berthingSide: "boreste" | "bombordo";
  imo?: string;
  type?: string;
  flag?: string;
}

export interface PraticagemLiveResponse {
  updatedAt: string;
  count: number;
  maneuvers: PraticagemManeuver[];
}

const LOCAL_STORAGE_CATALOG_KEY = "caislab:saved_vessels:v2";

/**
 * Verifica se a embarcação atraca no Terminal Rio (TECONTPROLONG ou TECONT1) ou se é cadastro manual.
 * Descarta navios de outros berços da baía de Guanabara (CPBS, T-OIL, SUDESTE, ÁREA 11, etc.).
 */
export function isTerminalVessel(v: CatalogVessel): boolean {
  if (!v.lastBerth) return true;
  const b = v.lastBerth.trim().toUpperCase();
  // Se tiver berço do terminal, aceita
  if (b.includes("TECONTPROLONG") || b.includes("TECONT1")) return true;
  // Rejeita explicitamente outros berços
  if (
    b.includes("CPBS") ||
    b.includes("T-OIL") ||
    b.includes("ÁREA") ||
    b.includes("AREA") ||
    b.includes("SUDESTE") ||
    b.includes("T-MULT") ||
    b.includes("CSN") ||
    b.includes("COSAN") ||
    b.includes("RNV") ||
    b.includes("B-PORT") ||
    b.includes("BPORT") ||
    b.includes("TERNIUM") ||
    b.includes("PP-") ||
    b.includes("PG-") ||
    b.includes("PS-") ||
    b.includes("TOLEO") ||
    b.includes("DOME") ||
    b.includes("ALISEO")
  ) {
    return false;
  }
  return false;
}

/**
 * Carrega a lista de Navios Salvos do Terminal (unindo localStorage e arquivo público JSON).
 */
export async function fetchVesselCatalog(): Promise<CatalogVessel[]> {
  const map = new Map<string, CatalogVessel>();

  // Limpar cache legado com navios de outros berços
  try {
    localStorage.removeItem("caislab:vessels_catalog:v1");
  } catch {}

  // 1. Tentar ler do arquivo / API
  try {
    const res = await fetch("/api/catalog/vessels", { cache: "no-store" });
    if (res.ok) {
      const data: CatalogVessel[] = await res.json();
      data.forEach((v) => {
        if (v.name && isTerminalVessel(v)) map.set(v.name.trim().toUpperCase(), v);
      });
    } else {
      // Fallback para arquivo estático
      const fallbackRes = await fetch("/vessels_catalog.json", { cache: "no-store" });
      if (fallbackRes.ok) {
        const data: CatalogVessel[] = await fallbackRes.json();
        data.forEach((v) => {
          if (v.name && isTerminalVessel(v)) map.set(v.name.trim().toUpperCase(), v);
        });
      }
    }
  } catch (err) {
    console.warn("Aviso ao buscar navios salvos via API, usando fallback:", err);
    try {
      const fallbackRes = await fetch("/vessels_catalog.json", { cache: "no-store" });
      if (fallbackRes.ok) {
        const data: CatalogVessel[] = await fallbackRes.json();
        data.forEach((v) => {
          if (v.name && isTerminalVessel(v)) map.set(v.name.trim().toUpperCase(), v);
        });
      }
    } catch {
      // ignore
    }
  }

  // 2. Mesclar com localStorage (para edições ou criações locais imediatas)
  try {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_CATALOG_KEY);
    if (localRaw) {
      const localData: CatalogVessel[] = JSON.parse(localRaw);
      localData.forEach((v) => {
        if (v.name && isTerminalVessel(v)) map.set(v.name.trim().toUpperCase(), v);
      });
    }
  } catch (e) {
    console.warn("Erro ao ler navios salvos do localStorage:", e);
  }

  const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/**
 * Salva ou atualiza um navio no catálogo permanente (tanto no servidor/JSON quanto no localStorage).
 */
export async function saveVesselToCatalog(vessel: CatalogVessel): Promise<CatalogVessel[]> {
  const cleanName = vessel.name.trim().toUpperCase();
  const entry: CatalogVessel = {
    ...vessel,
    name: cleanName,
    loa: Math.max(1, Number(vessel.loa) || 100),
    beam: Math.max(1, Number(vessel.beam) || 20),
    draft: Math.max(0, Number(vessel.draft) || 0),
    berthingSide: vessel.berthingSide === "bombordo" ? "bombordo" : "boreste",
    updatedAt: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };

  // Salvar no localStorage
  try {
    const current = await fetchVesselCatalog();
    const map = new Map<string, CatalogVessel>(current.map((v) => [v.name.toUpperCase(), v]));
    map.set(cleanName, entry);
    const updatedList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(updatedList));

    // Enviar para o servidor se disponível
    try {
      await fetch("/api/catalog/vessels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch {
      // offline / static mode ok
    }

    return updatedList;
  } catch (err) {
    console.error("Erro ao salvar navio no catálogo:", err);
    return [entry];
  }
}

/**
 * Remove um navio do catálogo permanente.
 */
export async function deleteVesselFromCatalog(name: string): Promise<CatalogVessel[]> {
  const cleanName = name.trim().toUpperCase();
  try {
    const current = await fetchVesselCatalog();
    const updatedList = current.filter((v) => v.name.toUpperCase() !== cleanName);
    localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(updatedList));

    try {
      await fetch(`/api/catalog/vessels?name=${encodeURIComponent(cleanName)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore
    }

    return updatedList;
  } catch (err) {
    console.error("Erro ao deletar navio do catálogo:", err);
    return [];
  }
}

/**
 * Carrega a lista de manobras ativas/programadas da Praticagem RJ.
 */
export async function fetchPraticagemLive(): Promise<PraticagemLiveResponse> {
  try {
    const res = await fetch("/api/praticagem/live", { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  try {
    const fallbackRes = await fetch("/praticagem_live.json", { cache: "no-store" });
    if (fallbackRes.ok) {
      return await fallbackRes.json();
    }
  } catch {
    // ignore
  }

  return { updatedAt: "", count: 0, maneuvers: [] };
}

/**
 * Solicita uma sincronização imediata (re-executa scraper da Praticagem RJ).
 */
export async function syncPraticagemNow(): Promise<{ success: boolean; count?: number; message?: string }> {
  try {
    const res = await fetch("/api/praticagem/sync", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      return { success: true, count: data.maneuversCount, message: "Praticagem RJ sincronizada com sucesso!" };
    }
  } catch (err) {
    console.warn("Erro ao acionar /api/praticagem/sync:", err);
  }
  return { success: false, message: "Não foi possível sincronizar no momento." };
}

/**
 * Exporta o catálogo em formato de arquivo JSON para download.
 */
export function exportCatalogJson(catalog: CatalogVessel[]) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(catalog, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `catalogo_navios_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
