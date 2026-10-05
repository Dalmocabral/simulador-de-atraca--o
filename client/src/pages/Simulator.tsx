import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Info,
  Plus,
  Radio,
  Ruler,
  Settings,
  Ship,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Sliders,
  Sparkles,
  RotateCcw,
  Maximize2,
  Box,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import BerthBlueprint from "@/components/berth-blueprint";
import AddVesselModal from "@/components/AddVesselModal";
import BerthViewModal from "@/components/BerthViewModal";
import Berth3DModal from "@/components/Berth3DModal";
import {
  calculateIssues,
  createBollardInventory,
  createDemoScenario,
  defaultMooringOffset,
  makeId,
  minimumRequiredLength,
  MOORING_LINE_LABELS,
  mooringOffsetLimits,
  normalizeMooringOffset,
  normalizeScenario,
  parseBollardCsv,
  readScenario,
  remainingLength,
  STORAGE_KEY,
  totalQuayLength,
  totalShipLength,
  vesselSectionName,
  serializeBollardCsv,
  type Bollard,
  type BollardType,
  BOLLARD_TYPES,
  type MooringLine,
  type MooringLineType,
  VESSEL_COLORS,
  type BerthSegment,
  type BerthingSide,
  type Scenario,
  type Vessel,
  type VesselColor,
  type VesselType,
  VESSEL_TYPE_LABELS,
  normalizeVesselType,
  type Portainer,
  DEFAULT_PORTAINERS,
  clampPortainerPosition,
  getPortainerOperationalLimits,
} from "@/lib/berth-model";

function metres(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} m`;
}

function safeWriteScenario(scenario: Scenario) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
    return true;
  } catch {
    return false;
  }
}

export default function Simulator() {
  const [scenario, setScenario] = useState<Scenario>(() => readScenario());
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(() => readScenario().vessels[0]?.id ?? null);
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("caislab:blueprint_zoom");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.5 && val <= 4.0) return val;
      }
    } catch {}
    return 1.5; // Padrão 150% para telas e executáveis
  });

  useEffect(() => {
    try {
      localStorage.setItem("caislab:blueprint_zoom", String(zoom));
    } catch {}
  }, [zoom]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const [isAddVesselModalOpen, setIsAddVesselModalOpen] = useState(false);
  const [isPortainerModalOpen, setIsPortainerModalOpen] = useState(false);
  const [isBerthViewModalOpen, setIsBerthViewModalOpen] = useState(false);
  const [isBerth3DModalOpen, setIsBerth3DModalOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const bollardImportRef = useRef<HTMLInputElement>(null);

  function patchPortainer(id: string, patch: Partial<Portainer>) {
    setScenario((curr) => {
      const list = curr.portainers ?? DEFAULT_PORTAINERS.map((p) => ({ ...p }));
      return {
        ...curr,
        portainers: list.map((p) => {
          if (p.id !== id) return p;
          let nextPos = patch.position !== undefined ? patch.position : p.position;
          if (patch.position !== undefined) {
            const clamped = clampPortainerPosition(id, nextPos, curr.bollards, total);
            nextPos = clamped.position;
            if (clamped.hitLimit && clamped.message) {
              setNotice(clamped.message);
            }
          }
          return { ...p, ...patch, position: nextPos };
        }),
      };
    });
  }

  function alignPortainersToMidship() {
    setScenario((curr) => {
      const list = (curr.portainers ?? DEFAULT_PORTAINERS).map((p) => ({ ...p }));
      // Identificar navios atracados no cais
      const coscoLike = curr.vessels.find((v) => v.position < 450) ?? curr.vessels[0];
      const vermilionLike = curr.vessels.find((v) => v.position >= 450) ?? curr.vessels[1];

      const midship1 = coscoLike ? coscoLike.position + coscoLike.loa / 2 : 268;
      const midship2 = vermilionLike ? vermilionLike.position + vermilionLike.loa / 2 : 690;

      // P7, P6, P9, P8 em torno de midship1
      const p7 = list.find((p) => p.id === "P7");
      const p6 = list.find((p) => p.id === "P6");
      const p9 = list.find((p) => p.id === "P9");
      const p8 = list.find((p) => p.id === "P8");
      if (p7) p7.position = Math.round(midship1 - 55);
      if (p6) p6.position = Math.round(midship1 - 20);
      if (p9) p9.position = Math.round(midship1 + 15);
      if (p8) p8.position = Math.round(midship1 + 50);

      // P5, P4 em torno de midship2
      const p5 = list.find((p) => p.id === "P5");
      const p4 = list.find((p) => p.id === "P4");
      if (p5) p5.position = Math.round(midship2 - 25);
      if (p4) p4.position = Math.round(midship2 + 25);

      return {
        ...curr,
        portainers: list,
        showPortainers: true,
      };
    });
    setNotice("Portêineres posicionados a meia-nau dos navios (P7, P6, P9, P8 e P5, P4).");
  }

  function resetPortainers() {
    setScenario((curr) => ({
      ...curr,
      portainers: DEFAULT_PORTAINERS.map((p) => ({ ...p })),
      showPortainers: true,
    }));
    setNotice("Posições dos 6 portêineres (P4 a P9) restauradas para os valores padrão do terminal.");
  }

  const total = totalQuayLength(scenario.segments);
  const positionedBollards = scenario.bollards.filter((bollard) => bollard.position !== null && bollard.position <= total).length;
  const outOfRangeBollards = scenario.bollards.filter((bollard) => bollard.position !== null && bollard.position > total).length;
  const loaTotal = totalShipLength(scenario.vessels);
  const minRequired = minimumRequiredLength(scenario.vessels, scenario.clearance);
  const remaining = remainingLength(scenario.segments, scenario.vessels, scenario.clearance);
  const issues = useMemo(() => calculateIssues(scenario), [scenario]);
  const selectedVessel = scenario.vessels.find((vessel) => vessel.id === selectedVesselId) ?? null;
  const hasCapacityWarning = remaining < 0;
  const hasPositionWarning = issues.length > 0;
  const usePercent = total > 0 ? Math.min(100, (minRequired / total) * 100) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const success = safeWriteScenario(scenario);
      setStorageError(!success);
      if (success) setLastSaved(new Date());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [scenario]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function patchScenario(patch: Partial<Scenario>) {
    setScenario((current) => ({ ...current, ...patch }));
  }

  function patchVessel(id: string, patch: Partial<Vessel>) {
    setScenario((current) => ({
      ...current,
      vessels: current.vessels.map((vessel) => vessel.id === id ? { ...vessel, ...patch } : vessel),
    }));
  }

  function patchSegment(id: string, patch: Partial<BerthSegment>) {
    setScenario((current) => ({
      ...current,
      segments: current.segments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment),
    }));
  }

  function patchBollard(id: string, position: number | null) {
    setScenario((current) => ({ ...current, bollards: current.bollards.map((bollard) => bollard.id === id ? { ...bollard, position } : bollard) }));
  }

  function updateBollard(id: string, patch: { id?: string; position?: number | null; type?: BollardType }) {
    const trimmed = patch.id ? patch.id.trim() : id;
    if (!trimmed) {
      setNotice("O número do cabeço não pode ser vazio.");
      return;
    }
    if (trimmed !== id && scenario.bollards.some((b) => b.id.toLowerCase() === trimmed.toLowerCase())) {
      setNotice(`Já existe um cabeço com a numeração "${trimmed}".`);
      return;
    }
    setScenario((current) => ({
      ...current,
      bollards: current.bollards.map((b) => (b.id === id ? { ...b, ...patch, id: trimmed } : b)),
      vessels: trimmed !== id ? current.vessels.map((v) => ({
        ...v,
        mooringLines: v.mooringLines.map((l) => (l.bollardId === id ? { ...l, bollardId: trimmed } : l)),
      })) : current.vessels,
    }));
    setNotice(`Cabeço ${trimmed} atualizado.`);
  }

  function addBollard() {
    const bollard: Bollard = { id: makeId("cabeço"), position: null };
    setScenario((current) => ({ ...current, bollards: [...current.bollards, bollard] }));
  }

  function removeBollard(id: string) {
    setScenario((current) => ({
      ...current,
      bollards: current.bollards.filter((bollard) => bollard.id !== id),
      vessels: current.vessels.map((vessel) => ({ ...vessel, mooringLines: vessel.mooringLines.map((line) => line.bollardId === id ? { ...line, bollardId: null } : line) })),
    }));
  }

  function addMooringLine(vesselId: string) {
    const vessel = scenario.vessels.find((item) => item.id === vesselId);
    const type: MooringLineType = "lancante-proa";
    const line: MooringLine = { id: makeId("cabo"), type, shipOffset: vessel ? defaultMooringOffset(type, vessel.loa) : null, bollardId: null };
    setScenario((current) => ({
      ...current,
      vessels: current.vessels.map((vessel) => vessel.id === vesselId ? { ...vessel, mooringLines: [line, ...vessel.mooringLines] } : vessel),
    }));
  }

  function addMooringKit(vesselId: string) {
    const vessel = scenario.vessels.find((item) => item.id === vesselId);
    if (!vessel) return;
    const types: MooringLineType[] = ["lancante-proa", "spring-proa", "spring-popa", "lancante-popa"];
    const newLines: MooringLine[] = types.map((type) => ({
      id: makeId("cabo"),
      type,
      shipOffset: defaultMooringOffset(type, vessel.loa),
      bollardId: null,
    }));
    setScenario((current) => ({
      ...current,
      vessels: current.vessels.map((v) =>
        v.id === vesselId ? { ...v, mooringLines: [...newLines, ...v.mooringLines] } : v
      ),
    }));
    setNotice(`4 cabos adicionados (Popa + Proa) ao navio "${vessel.name}".`);
  }

  function patchMooringLine(vesselId: string, lineId: string, patch: Partial<MooringLine>) {
    setScenario((current) => ({
      ...current,
      vessels: current.vessels.map((vessel) => vessel.id === vesselId ? {
        ...vessel,
        mooringLines: vessel.mooringLines.map((line) => line.id === lineId ? { ...line, ...patch } : line),
      } : vessel),
    }));
  }

  function removeMooringLine(vesselId: string, lineId: string) {
    setScenario((current) => ({
      ...current,
      vessels: current.vessels.map((vessel) => vessel.id === vesselId ? { ...vessel, mooringLines: vessel.mooringLines.filter((line) => line.id !== lineId) } : vessel),
    }));
  }

  function addVessel() {
    const colors: VesselColor[] = ["blue", "teal", "orange", "violet"];
    const id = makeId("navio");
    const vessel: Vessel = {
      id,
      name: `Novo navio ${String(scenario.vessels.length + 1).padStart(2, "0")}`,
      loa: 180,
      beam: 32,
      draft: 10,
      position: Math.max(0, scenario.vessels.reduce((end, item) => Math.max(end, item.position + item.loa), 0) + scenario.clearance),
      berthingSide: "boreste",
      gangwayOffset: 90,
      mooringLines: [],
      color: colors[scenario.vessels.length % colors.length],
    };
    setScenario((current) => ({ ...current, vessels: [...current.vessels, vessel] }));
    setSelectedVesselId(id);
  }

  function removeVessel(id: string) {
    const next = scenario.vessels.filter((vessel) => vessel.id !== id);
    setScenario((current) => ({ ...current, vessels: current.vessels.filter((vessel) => vessel.id !== id) }));
    if (selectedVesselId === id) setSelectedVesselId(next[0]?.id ?? null);
  }

  function addSegment() {
    const id = makeId("trecho");
    const segment: BerthSegment = {
      id,
      name: `Novo trecho ${scenario.segments.length + 1}`,
      length: 100,
    };
    setScenario((current) => ({ ...current, segments: [...current.segments, segment] }));
  }

  function removeSegment(id: string) {
    if (scenario.segments.length <= 1) return;
    setScenario((current) => ({ ...current, segments: current.segments.filter((segment) => segment.id !== id) }));
  }

  function saveNow() {
    const success = safeWriteScenario(scenario);
    setStorageError(!success);
    if (success) {
      setLastSaved(new Date());
      setNotice("Cenário salvo neste navegador.");
    } else {
      setNotice("Não foi possível salvar no armazenamento deste navegador. Exporte um arquivo JSON para não perder os dados.");
    }
  }

  function exportScenario() {
    const file = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scenario.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cenario-atracacao"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Arquivo JSON exportado.");
  }

  function exportBollardTemplate() {
    const file = new Blob([serializeBollardCsv(scenario.bollards)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-posicoes-cabecos-399-367.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Modelo CSV baixado. Preencha as posições em metros desde o início do cais.");
  }

  async function importBollards(file: File | undefined) {
    if (!file) return;
    try {
      const updates = parseBollardCsv(await file.text(), total);
      if (!updates.length) {
        setNotice("Nenhuma posição preenchida foi encontrada no CSV; o cenário não foi alterado.");
        return;
      }
      setScenario((current) => {
        const updatedIds = new Set(updates.map((item) => item.id));
        const existing = current.bollards.filter((item) => !updatedIds.has(item.id));
        return { ...current, bollards: [...existing, ...updates] };
      });
      setNotice(`${updates.length} posição(ões) de cabeço importada(s). Confira as estações no blueprint.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível importar o CSV. Use as colunas identificador;posicao_m.");
    } finally {
      if (bollardImportRef.current) bollardImportRef.current.value = "";
    }
  }

  async function importScenario(file: File | undefined) {
    if (!file) return;
    try {
      const normalized = normalizeScenario(JSON.parse(await file.text()));
      if (!normalized) throw new Error("Formato incompatível");
      setScenario(normalized);
      setSelectedVesselId(normalized.vessels[0]?.id ?? null);
      setNotice("Cenário importado e salvo localmente.");
    } catch {
      setNotice("Arquivo não reconhecido. Selecione um cenário JSON exportado pelo CaisLab.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function restoreDemo() {
    const demo = createDemoScenario();
    setScenario(demo);
    setSelectedVesselId(demo.vessels[0]?.id ?? null);
    setZoom(1.5);
    setNotice("Cenário demonstrativo restaurado; valores de cais são ilustrativos.");
  }

  function resetBollardsToPlan() {
    setScenario((current) => ({
      ...current,
      bollards: createBollardInventory(),
    }));
    setNotice("Cabeços redefinidos para os 33 cabeços com as cotas exatas da planta oficial (309 a 277).");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/favicon.svg" alt="" className="brand-mark" />
          <div className="brand-copy">
            <span className="brand-name">CaisLab</span>
            <span className="brand-caption">PLANEJAMENTO DE ATRACAÇÃO</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="local-status"><span className="status-dot" /> CENÁRIO LOCAL</span>
          <span className="saved-stamp">
            {storageError ? "Armazenamento indisponível" : lastSaved ? `Salvo ${lastSaved.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Salvando…"}
          </span>
          {/* 1. Visualização 2D */}
          <button
            className="button button-quiet text-[#0284c7] hover:text-[#0369a1] hover:bg-sky-50 border border-sky-200/90 shadow-xs font-semibold"
            type="button"
            onClick={() => setIsBerthViewModalOpen(true)}
            title="Abrir Visualização 2D técnica com dados do navio, cabeços e exportação em alta resolução"
          >
            <Layers size={14} className="text-[#0284c7]" /> <span>Visualização 2D</span>
          </button>

          {/* 2. Visualização 3D */}
          <button
            className="button button-quiet text-[#0d9488] hover:text-[#0f766e] hover:bg-teal-50 border border-teal-200/90 shadow-xs font-semibold"
            type="button"
            onClick={() => setIsBerth3DModalOpen(true)}
            title="Abrir Visualização 3D interativa do cais, navios, portêineres e amarrações"
          >
            <Box size={14} className="text-[#0d9488]" /> <span>Visualização 3D</span>
          </button>

          {/* 3. Configurações */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="button button-quiet" type="button" title="Configurações do cenário">
                <Settings size={16} /> <span>Configurações</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl w-[780px] max-w-[95vw] p-6">
              <DialogHeader>
                <div className="section-kicker">INFRAESTRUTURA DO CENÁRIO</div>
                <DialogTitle className="text-lg font-bold text-[#1b3a48]">Trechos de cais</DialogTitle>
                <DialogDescription className="text-xs text-[#859398]">
                  Os segmentos são apresentados em sequência no eixo longitudinal. Ajuste os comprimentos demonstrativos aos valores conhecidos.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-[#507079]">Segmentos configurados ({scenario.segments.length})</span>
                  <button className="button button-quiet" type="button" onClick={addSegment}>
                    <Plus size={15} /> Adicionar trecho
                  </button>
                </div>

                <div className="border border-[#e2e9eb] rounded-lg overflow-hidden bg-white shadow-xs" role="list" aria-label="Trechos de cais do cenário">
                  {scenario.segments.map((segment, index) => {
                    const start = scenario.segments.slice(0, index).reduce((sum, item) => sum + item.length, 0);
                    return (
                      <div className="segment-row" role="listitem" key={segment.id}>
                        <span className="segment-index">{String(index + 1).padStart(2, "0")}</span>
                        <div className="segment-name-edit">
                          <label className="visually-hidden" htmlFor={`cfg-segment-name-${segment.id}`}>Nome do trecho {index + 1}</label>
                          <input id={`cfg-segment-name-${segment.id}`} value={segment.name} onChange={(event) => patchSegment(segment.id, { name: event.target.value })} maxLength={40} />
                        </div>
                        <span className="segment-range">{start}–{start + segment.length} m</span>
                        <div className="segment-length-edit">
                          <label className="visually-hidden" htmlFor={`cfg-segment-length-${segment.id}`}>Comprimento do trecho em metros</label>
                          <input id={`cfg-segment-length-${segment.id}`} type="number" min="1" step="1" value={segment.length} onChange={(event) => patchSegment(segment.id, { length: Math.max(1, Number(event.target.value)) })} />
                          <span>m</span>
                        </div>
                        <button type="button" className="icon-button segment-remove" title="Remover trecho" aria-label={`Remover o trecho ${segment.name}`} disabled={scenario.segments.length <= 1} onClick={() => removeSegment(segment.id)}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center px-1 pt-1 text-xs text-[#507079] border-t border-[#edf1f2]">
                  <span>Comprimento longitudinal total:</span>
                  <strong className="text-sm font-bold text-[#1b3a48]">{metres(total)}</strong>
                </div>

                <div className="pt-3 border-t border-[#edf1f2]">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#1b3a48]">Alinhamento de cabeços ({scenario.bollards.length} cabeços cadastrados)</div>
                      <div className="text-[11px] text-[#859398]">Numeração oficial de 309 a 277 com as cotas exatas de engenharia da planta portuária.</div>
                    </div>
                    <button
                      type="button"
                      className="button button-quiet text-xs shrink-0"
                      onClick={resetBollardsToPlan}
                    >
                      Redefinir cabeços para planta oficial
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <input ref={importRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void importScenario(event.target.files?.[0])} />
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><Anchor size={14} /> CENTRO DE OPERAÇÕES <span className="eyebrow-divider">/</span> ATRACAÇÃO</div>
            <h1>Plano de atracação</h1>
            <p className="page-subtitle">Monte cenários, localize cabeços e visualize navios, acessos e amarrações no cais.</p>
          </div>
          <div className="scenario-name-wrap">
            <label htmlFor="scenario-name">CENÁRIO</label>
            <input id="scenario-name" className="scenario-name-input" value={scenario.name} onChange={(event) => patchScenario({ name: event.target.value })} maxLength={64} />
          </div>
        </div>


        <section className="metrics-grid" aria-label="Resumo do cenário">
          <article className="metric-card">
            <div className="metric-label"><Ruler size={15} /> Extensão total do cais</div>
            <div className="metric-value">{metres(total)}</div>
            <div className="metric-foot">{scenario.segments.length} {scenario.segments.length === 1 ? "trecho configurado" : "trechos configurados"}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label"><Ship size={15} /> Navios no cenário</div>
            <div className="metric-value">{String(scenario.vessels.length).padStart(2, "0")}</div>
            <div className="metric-foot">LOA total: {metres(loaTotal)}</div>
          </article>
          <article className={`metric-card ${hasCapacityWarning ? "metric-card-danger" : ""}`}>
            <div className="metric-label"><Anchor size={15} /> Comprimento requerido*</div>
            <div className="metric-value">{metres(minRequired)}</div>
            <div className="metric-foot">LOA + afastamento {metres(scenario.clearance)} nas bordas e entre posições</div>
          </article>
          <article className={`metric-card ${hasCapacityWarning ? "metric-card-danger" : "metric-card-positive"}`}>
            <div className="metric-label">{hasCapacityWarning ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} Reserva teórica*</div>
            <div className="metric-value">{remaining < 0 ? `−${metres(Math.abs(remaining))}` : metres(remaining)}</div>
            <div className="metric-foot">{total > 0 ? `${usePercent.toFixed(0)}% do requisito mínimo` : "Defina o comprimento do cais"}</div>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel blueprint-panel">
            <div className="panel-header blueprint-header">
              <div className="panel-title-wrap">
                <div className="section-kicker">VISTA SUPERIOR <span className="mini-live-dot" /> ATUALIZADA EM TEMPO REAL</div>
                <p>Arraste um navio para reposicionar e a ponta do cabo para escolher o cabeço.</p>
              </div>
              <div className="blueprint-controls">
                <label className="clearance-control" htmlFor="clearance-input">
                  <span>Afastamento mínimo</span>
                  <input id="clearance-input" type="number" min="0" step="1" value={scenario.clearance} onChange={(event) => patchScenario({ clearance: Math.max(0, Number(event.target.value)) })} />
                  <span>m</span>
                </label>

                {/* Opção check para os 6 portêineres (P4 a P9) */}
                <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#dfe7e9] rounded-md text-xs font-semibold text-[#1e3a47] cursor-pointer hover:bg-[#f6fafa] shadow-xs select-none">
                  <input
                    type="checkbox"
                    checked={scenario.showPortainers ?? true}
                    onChange={(e) => patchScenario({ showPortainers: e.target.checked })}
                    className="w-3.5 h-3.5 accent-[#16869a] rounded"
                  />
                  <span>Portêineres (P4–P9)</span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsPortainerModalOpen(true)}
                  className="button button-quiet text-xs px-2.5 py-1 h-[29px] text-[#16869a] flex items-center gap-1.5 font-semibold"
                  title="Configurar posições e visibilidade individual dos 6 portêineres"
                >
                  <Sliders size={13} />
                  <span>Configurar PTs</span>
                </button>

                <span className="zoom-label" title="Amplia toda a vista proporcionalmente; não altera as medidas ou parâmetros cadastrados.">ZOOM DA VISTA</span>
                <div className="zoom-control" aria-label="Zoom do blueprint">
                  <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))} aria-label="Diminuir zoom" disabled={zoom <= 0.5}><ZoomOut size={16} /></button>
                  <label className="visually-hidden" htmlFor="blueprint-zoom">Selecionar ampliação do cais</label>
                  <select id="blueprint-zoom" aria-label="Selecionar ampliação do cais" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
                    {Array.from({ length: 15 }, (_, index) => 0.5 + index * 0.25).map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                  </select>
                  <button type="button" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} aria-label="Aumentar zoom" disabled={zoom >= 4}><ZoomIn size={16} /></button>
                </div>
              </div>
            </div>

            <div className="blueprint-summary-row">
              <span className={`arrangement-badge ${hasCapacityWarning || hasPositionWarning ? "arrangement-warning" : "arrangement-ok"}`}>
                {hasCapacityWarning || hasPositionWarning ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                {hasCapacityWarning ? "REQUISITO ULTRAPASSA O CAIS" : hasPositionWarning ? "REVER POSIÇÕES LINEARES" : "SEM ALERTA DE OCUPAÇÃO LINEAR"}
              </span>
              <span className="blueprint-summary-explainer">Zoom proporcional: não altera medidas. Cabeços 309–277 com cotas em metros e tipos por cor. Clique no cabeço para editar número, tipo e distância.</span>
              <button className="reset-button" type="button" onClick={restoreDemo}>Restaurar demonstração</button>
            </div>

            <BerthBlueprint
              scenario={scenario}
              zoom={zoom}
              selectedVesselId={selectedVesselId}
              onSelectVessel={setSelectedVesselId}
              onMoveVessel={(id, position) => patchVessel(id, { position })}
              onAssignMooringLine={(vesselId, lineId, bollardId) => patchMooringLine(vesselId, lineId, { bollardId })}
              onUpdateBollard={updateBollard}
              onMovePortainer={(id, position) => patchPortainer(id, { position })}
              onPortainerLimitHit={(msg) => setNotice(msg)}
            />

            <div className="blueprint-legend">
              <span><i className="legend-ship" /> Porta-contêineres</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 10, height: 7, background: "#4f6277", border: "1px solid #1e293b", borderRadius: 1 }} /> Carga Geral</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 10, height: 7, background: "#fef08a", border: "1px solid #ca8a04", borderRadius: 1 }} /> Petroleiro</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 14, height: 8, background: "#4d7c0f", border: "1px solid #1e293b", borderRadius: 2 }} /> Portêineres (P4 a P9)</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 11, height: 7, background: "#f8fafc", border: "1.5px solid #b91c1c", borderRadius: 1 }} /> Manifolds químicos</span>
              <span><i className="legend-quay" /> Trecho de cais</span>
              <span><i className="legend-gap" /> Afastamento</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#3a7ebf", borderRadius: 2 }} /> Duplo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#6c757d", borderRadius: 2 }} /> Alto novo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#d62828", borderRadius: 2 }} /> Avariado</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#e67e22", borderRadius: 2 }} /> Baixo antigo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#3d4529", borderRadius: 2 }} /> Alto antigo</span>
              <span><i className="legend-line legend-line-lancante" /> Lançante</span>
              <span><i className="legend-line legend-line-spring" /> Spring</span>
              <span><i className="legend-gangway" /> Marcação da proa</span>
              <span className="drag-hint">Arraste navios, portêineres e pontas amarelas; use ← → no navio ou no cabo selecionado</span>
            </div>
          </article>

          <aside className="panel vessel-panel">
            <div className="panel-header vessel-panel-header">
              <div>
                <div className="section-kicker">FROTA DO CENÁRIO</div>
                <h2>Navios</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="button button-quiet text-xs px-2 py-1 h-[29px] text-emerald-700 flex items-center gap-1 font-semibold"
                  type="button"
                  onClick={() => setIsAddVesselModalOpen(true)}
                  title="Consultar chegadas da Praticagem RJ e Navios Salvos"
                >
                  <Radio size={13} className="text-emerald-600" />
                  <span>Praticagem / Salvos</span>
                </button>
                <button className="button button-add" type="button" onClick={() => setIsAddVesselModalOpen(true)}><Plus size={16} /> Adicionar</button>
              </div>
            </div>
            <div className="vessel-list">
              {scenario.vessels.map((vessel) => {
                const selected = selectedVesselId === vessel.id;
                const vesselIssues = issues.filter((issue) => issue.vesselId === vessel.id);
                const typeLabel = vessel.vesselType === "general-cargo" ? "Carga Geral" : vessel.vesselType === "tanker" ? "Petroleiro" : "Contêiner";
                return (
                  <button key={vessel.id} type="button" className={`vessel-list-item ${selected ? "vessel-list-item-selected" : ""}`} onClick={() => setSelectedVesselId(vessel.id)}>
                    <span className="vessel-color-chip" style={{ background: VESSEL_COLORS[vessel.color].fill }} />
                    <span className="vessel-list-copy">
                      <strong>{vessel.name || "Navio sem nome"}</strong>
                      <small>{Math.round(vessel.loa)} m LOA <span>·</span> <span className="font-semibold text-[#16869a]">{typeLabel}</span> <span>·</span> {vesselSectionName(vessel, scenario.segments)}</small>
                    </span>
                    {vesselIssues.length > 0 && <span className="list-warning-dot" title={vesselIssues[0].message}><AlertTriangle size={15} /></span>}
                    {vesselIssues.length === 0 && <span className="list-check-dot"><CheckCircle2 size={15} /></span>}
                  </button>
                );
              })}
              {scenario.vessels.length === 0 && <div className="empty-list"><Ship size={23} /><span>Nenhum navio no cenário.</span><button type="button" onClick={() => setIsAddVesselModalOpen(true)}>Adicionar embarcação</button></div>}
            </div>

            {selectedVessel ? (
              <div className="vessel-editor">
                <div className="editor-heading">
                  <div><span className="section-kicker">DADOS DO NAVIO</span><h3>Editar embarcação</h3></div>
                  <button type="button" className="icon-button delete-vessel" title="Remover navio" aria-label="Remover navio" onClick={() => removeVessel(selectedVessel.id)}><Trash2 size={16} /></button>
                </div>
                <label className="field-label" htmlFor="vessel-name">Nome do navio</label>
                <input id="vessel-name" className="text-input" value={selectedVessel.name} onChange={(event) => patchVessel(selectedVessel.id, { name: event.target.value })} placeholder="Ex.: Navio Alvorada" maxLength={54} />

                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor="vessel-loa">Comprimento · LOA</label>
                    <div className="unit-input"><input id="vessel-loa" type="number" min="1" step="1" value={selectedVessel.loa} onChange={(event) => { const loa = Math.max(1, Number(event.target.value)); patchVessel(selectedVessel.id, { loa, gangwayOffset: Math.min(selectedVessel.gangwayOffset, loa), mooringLines: selectedVessel.mooringLines.map((line) => ({ ...line, shipOffset: normalizeMooringOffset(line.type, loa, line.shipOffset) })) }); }} /><span>m</span></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="vessel-beam">Boca</label>
                    <div className="unit-input"><input id="vessel-beam" type="number" min="0" step="0.1" value={selectedVessel.beam} onChange={(event) => patchVessel(selectedVessel.id, { beam: Math.max(0, Number(event.target.value)) })} /><span>m</span></div>
                  </div>
                </div>
                <div className="field-row">
                  <div>
                    <label className="field-label" htmlFor="vessel-draft">Calado</label>
                    <div className="unit-input"><input id="vessel-draft" type="number" min="0" step="0.1" value={selectedVessel.draft} onChange={(event) => patchVessel(selectedVessel.id, { draft: Math.max(0, Number(event.target.value)) })} /><span>m</span></div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="vessel-position">Posição inicial</label>
                    <div className="unit-input"><input id="vessel-position" type="number" step="1" value={selectedVessel.position} onChange={(event) => patchVessel(selectedVessel.id, { position: Number(event.target.value) })} /><span>m</span></div>
                  </div>
                </div>
                <div className="position-context"><Anchor size={13} /> Medida desde o início do cais · {vesselSectionName(selectedVessel, scenario.segments)}</div>

                <div className="berthing-side-field">
                  <label className="field-label" htmlFor="vessel-berthing-side">Lado de atracação</label>
                  <select id="vessel-berthing-side" className="side-select" value={selectedVessel.berthingSide} onChange={(event) => patchVessel(selectedVessel.id, { berthingSide: event.target.value as BerthingSide })}>
                    <option value="bombordo">Bombordo</option>
                    <option value="boreste">Boreste</option>
                  </select>
                  <p className="form-hint">O traço colorido identifica o bordo voltado ao cais; a direção longitudinal de proa e popa permanece igual.</p>
                </div>

                <div className="field-row gangway-field-row">
                  <div>
                    <span className="field-label">Estação da Popa</span>
                    <div className="gangway-station"><strong className="text-xs">{metres(selectedVessel.berthingSide === "bombordo" ? selectedVessel.position + selectedVessel.loa : selectedVessel.position)}</strong></div>
                  </div>
                  <div>
                    <span className="field-label">Estação da Proa (Seta Roxa)</span>
                    <div className="gangway-station" style={{ borderColor: "#d5ceed", background: "#f5f3fa" }}><strong style={{ color: "#5a4b8a" }}>{metres(selectedVessel.berthingSide === "bombordo" ? selectedVessel.position : selectedVessel.position + selectedVessel.loa)}</strong></div>
                  </div>
                </div>
                <p className="form-hint">A seta roxa marca o bico da proa da embarcação projetado sobre o cais.</p>

                <section className="mooring-editor" aria-label="Amarrações do navio">
                  <div className="mooring-editor-heading">
                    <div><span className="section-kicker">CONEXÕES VISUAIS</span><h4>Lançantes e springs</h4></div>
                    <button
                      className="button button-add mooring-add-button"
                      type="button"
                      title="Adicionar conjunto padrão (1 spring e 1 lançante na proa + 1 spring e 1 lançante na popa)"
                      onClick={() => addMooringKit(selectedVessel.id)}
                    >
                      <Sparkles size={14} /> Cabos Popa + Proa
                    </button>
                  </div>
                  <p className="form-hint">Os pontos iniciais são ilustrativos: proa a 90% e popa a 10% do LOA. Ajuste pela planta (proa: 70–100%; popa: 0–30% medidos desde a popa) e arraste a ponta amarela até o cabeço. As posições esquemáticas dos cabeços não são coordenadas reais.</p>
                  {selectedVessel.mooringLines.length === 0 && <div className="mooring-empty">Nenhuma linha cadastrada para este navio.</div>}
                  {selectedVessel.mooringLines.map((line) => {
                    const connectedBollard = scenario.bollards.find((bollard) => bollard.id === line.bollardId);
                    const offsetLimits = mooringOffsetLimits(line.type, selectedVessel.loa);
                    const hasShipPoint = line.shipOffset !== null && line.shipOffset >= 0 && line.shipOffset <= selectedVessel.loa;
                    const connected = hasShipPoint && connectedBollard !== undefined;
                    const configured = connected && connectedBollard.position !== null && connectedBollard.position <= total;
                    const offsetOutsideEndZone = line.shipOffset !== null && (line.shipOffset < offsetLimits.min || line.shipOffset > offsetLimits.max);
                    return (
                      <div className="mooring-line-card" key={line.id}>
                        <div className="mooring-select-row">
                          <label className="visually-hidden" htmlFor={`line-type-${line.id}`}>Tipo da amarração</label>
                          <select id={`line-type-${line.id}`} className="mooring-select" value={line.type} onChange={(event) => { const type = event.target.value as MooringLineType; patchMooringLine(selectedVessel.id, line.id, { type, shipOffset: defaultMooringOffset(type, selectedVessel.loa) }); }}>
                            {(Object.entries(MOORING_LINE_LABELS) as [MooringLineType, string][]).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                          </select>
                          <label className="visually-hidden" htmlFor={`line-bollard-${line.id}`}>Cabeço de amarração</label>
                          <select id={`line-bollard-${line.id}`} className="mooring-select" value={line.bollardId ?? ""} onChange={(event) => patchMooringLine(selectedVessel.id, line.id, { bollardId: event.target.value || null })}>
                            <option value="">Selecionar cabeço…</option>
                            {scenario.bollards.map((bollard) => <option key={bollard.id} value={bollard.id}>Cabeço {bollard.id}{bollard.position === null ? " · sem posição" : bollard.position > total ? " · fora do cais" : ` · ${metres(bollard.position)}`}</option>)}
                          </select>
                          <button type="button" className="icon-button mooring-remove" aria-label={`Remover ${MOORING_LINE_LABELS[line.type]}`} title="Remover amarração" onClick={() => removeMooringLine(selectedVessel.id, line.id)}><X size={15} /></button>
                        </div>
                        <div className="mooring-offset-row">
                          <label htmlFor={`line-offset-${line.id}`}>Ponto na {line.type.endsWith("proa") ? "proa" : "popa"} · distância desde a popa</label>
                          <div className="unit-input mooring-offset-input"><input id={`line-offset-${line.id}`} type="number" min={offsetLimits.min} max={offsetLimits.max} step="0.1" value={line.shipOffset ?? defaultMooringOffset(line.type, selectedVessel.loa)} onChange={(event) => patchMooringLine(selectedVessel.id, line.id, { shipOffset: event.target.value === "" ? null : Number(event.target.value) })} onBlur={() => patchMooringLine(selectedVessel.id, line.id, { shipOffset: normalizeMooringOffset(line.type, selectedVessel.loa, line.shipOffset) })} /><span>m</span></div>
                        </div>
                        <span className={`mooring-line-status ${configured && !offsetOutsideEndZone ? "mooring-ready" : "mooring-pending"}`}>{offsetOutsideEndZone ? `Ponto fora da faixa da ${line.type.endsWith("proa") ? "proa" : "popa"}; ajuste a distância desde a popa` : configured ? `Cabo conectado ao cabeço ${connectedBollard.id} · estação cadastrada` : connectedBollard && connectedBollard.position !== null && connectedBollard.position > total ? `Cabeço ${connectedBollard.id} está fora do comprimento do cais` : connected ? `Cabeço ${connectedBollard.id} selecionado · posição ilustrativa; informe a estação real` : hasShipPoint ? "Arraste a ponta amarela no blueprint até o cabeço desejado" : "Ponto de proa/popa sugerido; confira a planta do navio"}</span>
                      </div>
                    );
                  })}
                </section>

                <label className="field-label color-field-label">Identificação visual</label>
                <div className="color-choices" role="radiogroup" aria-label="Cor de identificação do navio">
                  {(Object.entries(VESSEL_COLORS) as [VesselColor, typeof VESSEL_COLORS.blue][]).map(([key, color]) => (
                    <button key={key} type="button" role="radio" aria-checked={selectedVessel.color === key} aria-label={color.label} title={color.label} className={`color-choice ${selectedVessel.color === key ? "color-choice-selected" : ""}`} style={{ background: color.fill }} onClick={() => patchVessel(selectedVessel.id, { color: key })} />
                  ))}
                </div>

                {issues.filter((issue) => issue.vesselId === selectedVessel.id).map((issue, index) => (
                  <div key={`${issue.kind}-${index}`} className="vessel-inline-warning"><AlertTriangle size={14} /> {issue.message}</div>
                ))}
                {issues.every((issue) => issue.vesselId !== selectedVessel.id) && <div className="vessel-inline-info"><Info size={14} /> Boca e calado são exibidos, mas não validados neste protótipo.</div>}
              </div>
            ) : (
              <div className="editor-placeholder"><CircleHelp size={20} /><p>Selecione um navio no blueprint ou adicione uma embarcação para editar seus dados.</p></div>
            )}
          </aside>
        </section>





        <section className="calculation-note">
          <div className="calculation-note-icon"><Info size={17} /></div>
          <p><strong>* Leitura do requisito mínimo:</strong> soma dos LOAs mais o afastamento configurado nas duas bordas do cais e entre navios. Cabeços, cabos e escada são mostrados a partir das posições inseridas; o app não calcula tensão, ângulo admissível, capacidade dos cabeços, passarela segura ou autoriza a operação. <a href="/arquitetura-e-limites.md" target="_blank" rel="noreferrer">Consulte arquitetura, premissas e limites.</a></p>
        </section>

        <footer className="page-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", padding: "14px 0", borderTop: "1px solid #e2e8ea", marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "#48626c" }}>
              <span className="footer-dot" /> Modo operacional
            </span>
            <span style={{ color: "#94a3a8" }}>•</span>
            <span style={{ color: "#64748b" }}>Simulador de atracação portuária</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <span style={{ color: "#475569", fontWeight: 500, fontSize: "11px" }}>
              Desenvolvido por <strong style={{ color: "#16869a", fontWeight: 700 }}>Dalmo dos Santos Cabral</strong>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <a
                href="https://www.linkedin.com/in/dalmo-cabral-062374131/"
                target="_blank"
                rel="noopener noreferrer"
                title="LinkedIn de Dalmo dos Santos Cabral"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 9px",
                  borderRadius: "6px",
                  backgroundColor: "#0a66c2",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                LinkedIn
              </a>
              <a
                href="https://github.com/Dalmocabral"
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub de Dalmo dos Santos Cabral"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 9px",
                  borderRadius: "6px",
                  backgroundColor: "#24292f",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </footer>
        <div className="live-notice" aria-live="polite">{notice}</div>

        <AddVesselModal
          open={isAddVesselModalOpen}
          onOpenChange={setIsAddVesselModalOpen}
          onAddVessel={(vessel, noticeMsg) => {
            setScenario((current) => ({
              ...current,
              vessels: [...current.vessels, vessel],
            }));
            setSelectedVesselId(vessel.id);
            if (noticeMsg) {
              setNotice(noticeMsg);
            }
          }}
          currentVessels={scenario.vessels}
          quayClearance={scenario.clearance}
        />

        {/* Modal de Configuração dos Portêineres (P4 a P9) */}
        <Dialog open={isPortainerModalOpen} onOpenChange={setIsPortainerModalOpen}>
          <DialogContent className="sm:max-w-xl p-6 bg-white border border-[#d8e1e4] rounded-xl shadow-2xl">
            <DialogHeader>
              <div className="section-kicker">INFRAESTRUTURA DE CARGA</div>
              <DialogTitle className="text-lg font-bold text-[#102d40] flex items-center justify-between">
                <span>Portêineres STS do Terminal (P4 a P9)</span>
                <span className="text-xs font-mono font-bold bg-[#e0f2fe] text-[#0369a1] px-2.5 py-1 rounded-full border border-[#bae6fd]">
                  6 Guindastes de Cais
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#64748b]">
                Gerenciamento operacional dos 6 guindastes de contêineres STS (Ship-to-Shore) do cais.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Barra superior com interruptor geral e ações rápidas */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg">
                <label className="flex items-center gap-2 text-xs font-bold text-[#0f172a] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={scenario.showPortainers ?? true}
                    onChange={(e) => patchScenario({ showPortainers: e.target.checked })}
                    className="w-4 h-4 accent-[#16869a] rounded"
                  />
                  <span>Exibir portêineres no blueprint</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={alignPortainersToMidship}
                    className="button button-primary text-xs px-2.5 py-1 h-[30px] flex items-center gap-1.5 shadow-xs"
                    title="Posicionar portêineres a meia-nau das embarcações conforme instrução operacional do terminal"
                  >
                    <Sparkles size={13} />
                    <span>Meia-nau dos navios</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetPortainers}
                    className="button button-quiet text-xs px-2.5 py-1 h-[30px] text-[#64748b] flex items-center gap-1.5 hover:text-[#0f172a]"
                    title="Restaurar posições originais dos 6 portêineres"
                  >
                    <RotateCcw size={13} />
                    <span>Redefinir</span>
                  </button>
                </div>
              </div>

              {/* Lista dos 6 Portêineres */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {(scenario.portainers ?? DEFAULT_PORTAINERS).map((pt) => {
                  const ptLimits = getPortainerOperationalLimits(scenario.bollards)[pt.id];
                  const section = scenario.segments.length > 0
                    ? (() => {
                        let cur = 0;
                        for (const seg of scenario.segments) {
                          if (pt.position >= cur && pt.position <= cur + seg.length) {
                            return seg.name;
                          }
                          cur += seg.length;
                        }
                        return "Fora do cais";
                      })()
                    : "Cais";

                  const overVessel = scenario.vessels.find(
                    (v) => pt.position >= v.position && pt.position <= v.position + v.loa
                  );

                  return (
                    <div
                      key={pt.id}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all ${
                        pt.enabled
                          ? "bg-white border-[#cbd5e1] hover:border-[#94a3b8] shadow-xs"
                          : "bg-[#f1f5f9] border-[#e2e8f0] opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={pt.enabled}
                          onChange={(e) => patchPortainer(pt.id, { enabled: e.target.checked })}
                          className="w-4 h-4 accent-[#16869a] rounded cursor-pointer"
                          title={`Ativar ou ocultar ${pt.name}`}
                        />
                        <span
                          className="w-9 h-6 rounded flex items-center justify-center text-white text-[11px] font-black font-mono shadow-xs shrink-0"
                          style={{ background: pt.badgeColor }}
                        >
                          {pt.name}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-[#0f172a] flex items-center gap-1.5">
                            <span>Portêiner {pt.name}</span>
                            <span className="text-[10px] text-[#64748b] font-normal">· {section}</span>
                            {ptLimits?.min !== undefined && (
                              <span className="text-[9.5px] font-bold text-[#7e22ce] bg-[#f3e8ff] px-1.5 py-0.5 rounded border border-[#d8b4fe]">
                                Limite mín: {ptLimits.min} m (297–296)
                              </span>
                            )}
                            {ptLimits?.max !== undefined && (
                              <span className="text-[9.5px] font-bold text-[#1d4ed8] bg-[#dbeafe] px-1.5 py-0.5 rounded border border-[#93c5fd]">
                                Limite máx: {ptLimits.max} m (291–290)
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-[#64748b]">
                            {overVessel ? (
                              <span className="text-[#0369a1] font-semibold">
                                Operando sobre: {overVessel.name}
                              </span>
                            ) : (
                              <span>Sem navio sob a lança</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-[#64748b] font-medium">Estação:</span>
                        <div className="flex items-center">
                          <input
                            type="number"
                            step="0.5"
                            min={ptLimits?.min ?? 0}
                            max={ptLimits?.max ?? total}
                            value={pt.position}
                            onChange={(e) => patchPortainer(pt.id, { position: Math.max(0, Number(e.target.value)) })}
                            className="w-20 h-8 px-2 border border-[#cbd5e1] rounded-l-md text-xs font-mono font-bold text-[#0f172a] focus:outline-none focus:border-[#16869a]"
                          />
                          <span className="h-8 px-2 bg-[#f1f5f9] border border-l-0 border-[#cbd5e1] rounded-r-md text-[11px] font-bold text-[#64748b] flex items-center">
                            m
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-2.5 bg-[#fefce8] border border-[#fef08a] rounded-md text-[11px] text-[#854d0e] flex items-start gap-2">
                <Info size={15} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Limites Operacionais:</strong> o <strong>P5</strong> não pode ultrapassar o ponto médio entre os cabeços <strong>297 e 296</strong>. O <strong>P6</strong> não pode ultrapassar o ponto médio entre os cabeços <strong>291 e 290</strong>. Se tentar ultrapassar, o portêiner trava imediatamente e exibe o alerta.
                </span>
              </div>

              <div className="flex justify-end pt-2 border-t border-[#edf1f2]">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setIsPortainerModalOpen(false)}
                >
                  Concluir
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Vista Operacional da Atracação 2D */}
        <BerthViewModal
          isOpen={isBerthViewModalOpen}
          onClose={() => setIsBerthViewModalOpen(false)}
          scenario={scenario}
          selectedVesselId={selectedVesselId}
          onSelectVessel={setSelectedVesselId}
          onMoveVessel={(id, position) => patchVessel(id, { position })}
          onAssignMooringLine={(vesselId, lineId, bollardId) => patchMooringLine(vesselId, lineId, { bollardId })}
          onUpdateBollard={updateBollard}
          onMovePortainer={(id, position) => patchPortainer(id, { position })}
          onPortainerLimitHit={(msg) => setNotice(msg)}
        />

        {/* Modal de Visualização 3D Interativa */}
        <Berth3DModal
          isOpen={isBerth3DModalOpen}
          onClose={() => setIsBerth3DModalOpen(false)}
          scenario={scenario}
        />
      </main>
    </div>
  );
}
