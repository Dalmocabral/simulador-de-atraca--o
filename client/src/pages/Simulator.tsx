import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  Info,
  Plus,
  Radio,
  Ruler,
  Save,
  Settings,
  Ship,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
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
import { saveVesselToCatalog } from "@/lib/vessel-catalog";
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
  const [zoom, setZoom] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const [isAddVesselModalOpen, setIsAddVesselModalOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const bollardImportRef = useRef<HTMLInputElement>(null);

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
      vessels: current.vessels.map((vessel) => vessel.id === vesselId ? { ...vessel, mooringLines: [...vessel.mooringLines, line] } : vessel),
    }));
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
          <button className="button button-quiet" type="button" onClick={() => setIsAddVesselModalOpen(true)} title="Consultar chegadas da Praticagem RJ ou catálogo salvo">
            <Radio size={14} className="text-emerald-600" /> <span>Praticagem RJ / Catálogo</span>
          </button>
          <button className="button button-quiet" type="button" onClick={exportScenario} title="Baixar cenário como JSON">
            <Download size={16} /> <span>Exportar</span>
          </button>
          <button className="button button-primary" type="button" onClick={saveNow}>
            <Save size={16} /> <span>Salvar</span>
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void importScenario(event.target.files?.[0])} />
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><Anchor size={14} /> CENTRO DE OPERAÇÕES <span className="eyebrow-divider">/</span> ATRACAÇÃO</div>
            <h1>Plano de ocupação</h1>
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
                <h2>Blueprint do cais</h2>
                <p>Arraste um navio para reposicionar e a ponta do cabo para escolher o cabeço.</p>
              </div>
              <div className="blueprint-controls">
                <label className="clearance-control" htmlFor="clearance-input">
                  <span>Afastamento mínimo</span>
                  <input id="clearance-input" type="number" min="0" step="1" value={scenario.clearance} onChange={(event) => patchScenario({ clearance: Math.max(0, Number(event.target.value)) })} />
                  <span>m</span>
                </label>
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
            />

            <div className="blueprint-legend">
              <span><i className="legend-ship" /> Navio</span>
              <span><i className="legend-quay" /> Trecho de cais</span>
              <span><i className="legend-gap" /> Afastamento medido</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#3a7ebf", borderRadius: 2 }} /> Duplo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#6c757d", borderRadius: 2 }} /> Alto novo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#d62828", borderRadius: 2 }} /> Avariado</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#e67e22", borderRadius: 2 }} /> Baixo antigo</span>
              <span className="inline-flex items-center gap-1.5"><i style={{ display: "inline-block", width: 8, height: 12, background: "#3d4529", borderRadius: 2 }} /> Alto antigo</span>
              <span><i className="legend-line legend-line-lancante" /> Lançante</span>
              <span><i className="legend-line legend-line-spring" /> Spring</span>
              <span><i className="legend-gangway" /> Marcação da proa</span>
              <span className="drag-hint">Arraste navios e pontas amarelas; use ← → no navio ou no cabo selecionado</span>
            </div>
          </article>

          <aside className="panel vessel-panel">
            <div className="panel-header vessel-panel-header">
              <div>
                <div className="section-kicker">FROTA DO CENÁRIO</div>
                <h2>Navios</h2>
              </div>
              <button className="button button-add" type="button" onClick={() => setIsAddVesselModalOpen(true)}><Plus size={16} /> Adicionar</button>
            </div>
            <div className="vessel-list">
              {scenario.vessels.map((vessel) => {
                const selected = selectedVesselId === vessel.id;
                const vesselIssues = issues.filter((issue) => issue.vesselId === vessel.id);
                return (
                  <button key={vessel.id} type="button" className={`vessel-list-item ${selected ? "vessel-list-item-selected" : ""}`} onClick={() => setSelectedVesselId(vessel.id)}>
                    <span className="vessel-color-chip" style={{ background: VESSEL_COLORS[vessel.color].fill }} />
                    <span className="vessel-list-copy">
                      <strong>{vessel.name || "Navio sem nome"}</strong>
                      <small>{Math.round(vessel.loa)} m LOA <span>·</span> {vesselSectionName(vessel, scenario.segments)}</small>
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
                <div className="flex gap-2 items-center">
                  <input id="vessel-name" className="text-input flex-1" value={selectedVessel.name} onChange={(event) => patchVessel(selectedVessel.id, { name: event.target.value })} placeholder="Ex.: Navio Alvorada" maxLength={54} />
                  <button
                    type="button"
                    onClick={async () => {
                      await saveVesselToCatalog({
                        name: selectedVessel.name,
                        loa: selectedVessel.loa,
                        beam: selectedVessel.beam,
                        draft: selectedVessel.draft,
                        berthingSide: selectedVessel.berthingSide,
                      });
                      setNotice(`Navio "${selectedVessel.name}" salvo no catálogo permanente.`);
                    }}
                    className="button button-quiet text-[10px] px-2 h-[34px] text-[#16869a]"
                    title="Gravar este navio no catálogo permanente para futuras simulações"
                  >
                    <Save size={13} /> Gravar no catálogo
                  </button>
                </div>

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
                  <label className="field-label" htmlFor="vessel-berthing-side">Lado voltado para o cais</label>
                  <select id="vessel-berthing-side" className="side-select" value={selectedVessel.berthingSide} onChange={(event) => patchVessel(selectedVessel.id, { berthingSide: event.target.value as BerthingSide })}>
                    <option value="boreste">Boreste junto ao cais</option>
                    <option value="bombordo">Bombordo junto ao cais</option>
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
                    <button className="button button-add mooring-add-button" type="button" onClick={() => addMooringLine(selectedVessel.id)}><Plus size={14} /> Cabo</button>
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

        <footer className="page-footer">
          <span><span className="footer-dot" /> Modo operacional</span>
          <span>Simulador de atracação integrado com Praticagem RJ e catálogo permanente de navios.</span>
          <button type="button" onClick={restoreDemo}>Restaurar dados de exemplo</button>
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
      </main>
    </div>
  );
}
