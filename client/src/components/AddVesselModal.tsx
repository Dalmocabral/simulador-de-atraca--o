import { useEffect, useMemo, useState, useRef } from "react";
import {
  Anchor,
  Clock,
  Download,
  Filter,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Ship,
  Sparkles,
  Trash2,
  Upload,
  X,
  Compass,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CatalogVessel,
  type PraticagemManeuver,
  fetchPraticagemLive,
  fetchVesselCatalog,
  saveVesselToCatalog,
  deleteVesselFromCatalog,
  syncPraticagemNow,
  exportCatalogJson,
} from "@/lib/vessel-catalog";
import {
  type BerthingSide,
  type Vessel,
  type VesselColor,
  type VesselType,
  VESSEL_TYPE_LABELS,
  normalizeVesselType,
  VESSEL_COLORS,
  makeId,
  normalizeMooringOffset,
} from "@/lib/berth-model";

interface AddVesselModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddVessel: (vessel: Vessel, noticeMsg?: string) => void;
  currentVessels: Vessel[];
  quayClearance: number;
}

export default function AddVesselModal({
  open,
  onOpenChange,
  onAddVessel,
  currentVessels,
  quayClearance,
}: AddVesselModalProps) {
  const [activeTab, setActiveTab] = useState<"praticagem" | "catalog" | "manual">("praticagem");
  
  // Praticagem RJ state
  const [liveManeuvers, setLiveManeuvers] = useState<PraticagemManeuver[]>([]);
  const [praticagemUpdated, setPraticagemUpdated] = useState<string>("");
  const [loadingPraticagem, setLoadingPraticagem] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [praticagemSearch, setPraticagemSearch] = useState("");
  const [praticagemFilter, setPraticagemFilter] = useState<"all" | "prolong" | "tecon1">("all");

  // Catalog state
  const [catalog, setCatalog] = useState<CatalogVessel[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const catalogImportRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Manual form state
  const [manualName, setManualName] = useState("");
  const [manualLoa, setManualLoa] = useState(200);
  const [manualBeam, setManualBeam] = useState(32);
  const [manualDraft, setManualDraft] = useState(10.5);
  const [manualSide, setManualSide] = useState<BerthingSide>("boreste");
  const [manualColor, setManualColor] = useState<VesselColor>("blue");
  const [manualType, setManualType] = useState<VesselType>("container");
  const [saveToCatalog, setSaveToCatalog] = useState(true);

  // Reset any accidental scroll when switching tabs
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      loadPraticagem();
      loadCatalog();
    }
  }, [open]);

  async function loadPraticagem() {
    setLoadingPraticagem(true);
    try {
      const res = await fetchPraticagemLive();
      setLiveManeuvers(res.maneuvers || []);
      setPraticagemUpdated(res.updatedAt || "");
    } catch (e) {
      console.error("Erro ao carregar manobras da Praticagem:", e);
    } finally {
      setLoadingPraticagem(false);
    }
  }

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const list = await fetchVesselCatalog();
      setCatalog(list);
    } catch (e) {
      console.error("Erro ao carregar catálogo:", e);
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function handleSyncPraticagem() {
    setSyncing(true);
    try {
      const res = await syncPraticagemNow();
      await loadPraticagem();
      await loadCatalog();
    } catch (e) {
      console.error("Erro ao sincronizar Praticagem RJ:", e);
    } finally {
      setSyncing(false);
    }
  }

  // Calculate safe berth position matching the berth section
  function calculateNextPosition(loa: number, berthTo?: string): number {
    const isTecon1 = (berthTo || "").toUpperCase().includes("TECONT1");
    const isProlong = (berthTo || "").toUpperCase().includes("PROLONG");

    // Preferred berth station range:
    // Expansão: 0-85m | Prolongamento: 85-515m | Tecon 1: 515-900m
    let preferredStart = quayClearance;
    if (isProlong) {
      preferredStart = 85 + quayClearance;
    } else if (isTecon1) {
      preferredStart = 515 + quayClearance;
    }

    // Check if preferred start overlaps with any currently moored vessel
    const overlaps = (start: number) => {
      const end = start + loa;
      return currentVessels.some(
        (v) => start < v.position + v.loa + quayClearance && end > v.position - quayClearance
      );
    };

    if (!overlaps(preferredStart)) {
      return preferredStart;
    }

    if (currentVessels.length === 0) {
      return preferredStart;
    }

    // Otherwise place after the rightmost ship
    const maxEnd = currentVessels.reduce(
      (end, v) => Math.max(end, v.position + v.loa),
      0
    );
    return maxEnd + quayClearance;
  }

  // Choose next color
  function getNextColor(): VesselColor {
    const colors: VesselColor[] = ["blue", "teal", "orange", "violet"];
    return colors[currentVessels.length % colors.length];
  }

  // Handle adding from Praticagem RJ (Terminal Rio)
  async function handleAddFromPraticagem(m: PraticagemManeuver) {
    const id = makeId("navio");
    const loa = Math.max(1, m.loa || 200);
    const beam = Math.max(1, m.beam || 32);
    const draft = Math.max(0, m.draft || 10);
    const side: BerthingSide = m.berthingSide === "bombordo" ? "bombordo" : "boreste";
    const position = calculateNextPosition(loa, m.berthTo);
    const color = getNextColor();
    const vesselType = normalizeVesselType(m.type);

    const newVessel: Vessel = {
      id,
      name: m.name,
      loa,
      beam,
      draft,
      position,
      berthingSide: side,
      gangwayOffset: loa / 2,
      mooringLines: [],
      color,
      vesselType,
    };

    // Auto save to persistent catalog
    const catalogEntry: CatalogVessel = {
      name: m.name,
      loa,
      beam,
      draft,
      berthingSide: side,
      imo: m.imo,
      type: m.type || VESSEL_TYPE_LABELS[vesselType],
      flag: m.flag,
      lastBerth: m.berthTo || m.berthFrom || "",
    };
    await saveVesselToCatalog(catalogEntry);
    await loadCatalog();

    onAddVessel(
      newVessel,
      `Navio "${m.name}" (${VESSEL_TYPE_LABELS[vesselType]}) adicionado da escala do Terminal (${m.berthTo || "Tecon Rio"}, LOA ${loa}m, Boca ${beam}m, Calado ${draft}m) e gravado em Navios Salvos.`
    );
    onOpenChange(false);
  }

  // Handle adding from saved catalog
  async function handleAddFromCatalog(v: CatalogVessel) {
    const id = makeId("navio");
    const loa = Math.max(1, v.loa || 200);
    const beam = Math.max(1, v.beam || 32);
    const draft = Math.max(0, v.draft || 10);
    const side: BerthingSide = v.berthingSide === "bombordo" ? "bombordo" : "boreste";
    const position = calculateNextPosition(loa);
    const color = getNextColor();
    const vesselType = normalizeVesselType(v.type);

    const newVessel: Vessel = {
      id,
      name: v.name,
      loa,
      beam,
      draft,
      position,
      berthingSide: side,
      gangwayOffset: loa / 2,
      mooringLines: [],
      color,
      vesselType,
    };

    onAddVessel(
      newVessel,
      `Navio "${v.name}" (${VESSEL_TYPE_LABELS[vesselType]}) carregado de Navios Salvos (LOA ${loa}m, Boca ${beam}m, Calado ${draft}m).`
    );
    onOpenChange(false);
  }

  // Handle manual submit
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = manualName.trim() || `Novo navio ${String(currentVessels.length + 1).padStart(2, "0")}`;
    const id = makeId("navio");
    const loa = Math.max(1, Number(manualLoa) || 180);
    const beam = Math.max(1, Number(manualBeam) || 32);
    const draft = Math.max(0, Number(manualDraft) || 10);
    const position = calculateNextPosition(loa);

    const newVessel: Vessel = {
      id,
      name: cleanName,
      loa,
      beam,
      draft,
      position,
      berthingSide: manualSide,
      gangwayOffset: loa / 2,
      mooringLines: [],
      color: manualColor,
      vesselType: manualType,
    };

    if (saveToCatalog) {
      await saveVesselToCatalog({
        name: cleanName,
        loa,
        beam,
        draft,
        berthingSide: manualSide,
        type: VESSEL_TYPE_LABELS[manualType],
      });
      await loadCatalog();
    }

    onAddVessel(
      newVessel,
      `Navio "${cleanName}" (${VESSEL_TYPE_LABELS[manualType]}) adicionado ao cenário${saveToCatalog ? " e gravado em Navios Salvos" : ""}.`
    );
    onOpenChange(false);
  }

  // Filtered Praticagem Maneuvers
  const filteredPraticagem = useMemo(() => {
    return liveManeuvers.filter((m) => {
      // Search
      const searchMatch =
        !praticagemSearch ||
        m.name.toLowerCase().includes(praticagemSearch.toLowerCase()) ||
        (m.berthTo && m.berthTo.toLowerCase().includes(praticagemSearch.toLowerCase())) ||
        (m.berthFrom && m.berthFrom.toLowerCase().includes(praticagemSearch.toLowerCase())) ||
        (m.imo && m.imo.includes(praticagemSearch));

      if (!searchMatch) return false;

      // Filter category
      if (praticagemFilter === "prolong") {
        return (m.berthTo + " " + m.berthFrom).toUpperCase().includes("PROLONG");
      }
      if (praticagemFilter === "tecon1") {
        return (m.berthTo + " " + m.berthFrom).toUpperCase().includes("TECONT1");
      }
      return true;
    });
  }, [liveManeuvers, praticagemSearch, praticagemFilter]);

  // Filtered Catalog
  const filteredCatalog = useMemo(() => {
    return catalog.filter((v) => {
      if (!catalogSearch) return true;
      const q = catalogSearch.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        (v.imo && v.imo.includes(q)) ||
        (v.type && v.type.toLowerCase().includes(q)) ||
        (v.lastBerth && v.lastBerth.toLowerCase().includes(q))
      );
    });
  }, [catalog, catalogSearch]);

  // Handle JSON Import into Catalog
  function handleCatalogImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.name) {
              await saveVesselToCatalog(item);
            }
          }
          await loadCatalog();
        }
      } catch (err) {
        alert("Erro ao importar arquivo JSON: " + err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={modalRef}
        className="sm:!max-w-4xl md:!max-w-5xl w-[94vw] !h-[88vh] !max-h-[88vh] !p-0 !gap-0 !flex !flex-col !overflow-hidden bg-white border border-[#d6e2e6] rounded-xl shadow-2xl"
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
        }}
      >
        {/* Header (pinned) */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#102d40] to-[#1a445d] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
              <Ship className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-bold tracking-tight text-white m-0">
                  Adicionar Embarcação ao Terminal
                </DialogTitle>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Tecon Rio
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation (pinned) */}
        <div className="flex border-b border-[#e1e9ec] bg-[#f8fafb] px-6 gap-2 pt-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("praticagem")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-t border-x whitespace-nowrap cursor-pointer ${
              activeTab === "praticagem"
                ? "bg-white text-[#102d40] border-[#d4e1e5] border-b-transparent shadow-sm translate-y-[1px]"
                : "text-[#627780] hover:text-[#102d40] border-transparent hover:bg-white/50"
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse flex-shrink-0" />
            <span>Atracações no Terminal</span>
            {liveManeuvers.length > 0 && (
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {liveManeuvers.length} navios
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-t border-x whitespace-nowrap cursor-pointer ${
              activeTab === "catalog"
                ? "bg-white text-[#102d40] border-[#d4e1e5] border-b-transparent shadow-sm translate-y-[1px]"
                : "text-[#627780] hover:text-[#102d40] border-transparent hover:bg-white/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#16869a] flex-shrink-0" />
            <span>Navios Salvos</span>
            <span className="bg-cyan-100 text-cyan-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {catalog.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-t border-x whitespace-nowrap cursor-pointer ${
              activeTab === "manual"
                ? "bg-white text-[#102d40] border-[#d4e1e5] border-b-transparent shadow-sm translate-y-[1px]"
                : "text-[#627780] hover:text-[#102d40] border-transparent hover:bg-white/50"
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-[#627780] flex-shrink-0" />
            <span>Cadastro Manual</span>
          </button>
        </div>

        {/* Tab 1: Praticagem RJ */}
        {activeTab === "praticagem" && (
          <div className="flex-1 flex flex-col min-h-0 p-5 bg-white overflow-hidden">
            {/* Toolbar Row 1: Search & Sync */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={praticagemSearch}
                  onChange={(e) => setPraticagemSearch(e.target.value)}
                  placeholder="Buscar navio por nome, berço, IMO..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a] bg-white shadow-xs"
                />
                {praticagemSearch && (
                  <button
                    type="button"
                    onClick={() => setPraticagemSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 justify-end">
                {praticagemUpdated && (
                  <span className="text-[11px] text-[#6b7f88] flex items-center gap-1.5 font-medium whitespace-nowrap">
                    <Clock className="w-3.5 h-3.5 text-[#16869a]" /> Atualizado: {praticagemUpdated}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSyncPraticagem}
                  disabled={syncing}
                  className="px-3.5 py-2 bg-[#eef7f8] hover:bg-[#dff0f2] text-[#126f7f] border border-[#d0e6ea] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 shadow-xs cursor-pointer"
                  title="Atualizar dados diretamente do site da Praticagem RJ"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                  <span>{syncing ? "Sincronizando..." : "Sincronizar Praticagem RJ"}</span>
                </button>
              </div>
            </div>

            {/* Toolbar Row 2: Filter chips */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
              <span className="text-[11px] font-semibold text-[#6e828a] uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3 text-[#16869a]" /> Berço:
              </span>
              <button
                type="button"
                onClick={() => setPraticagemFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shrink-0 cursor-pointer ${
                  praticagemFilter === "all"
                    ? "bg-[#102d40] text-white border-[#102d40] shadow-sm"
                    : "bg-white text-[#526871] border-[#d8e2e5] hover:bg-[#f6f9fa]"
                }`}
                style={praticagemFilter === "all" ? { color: "#ffffff" } : {}}
              >
                Todos do Terminal ({liveManeuvers.length})
              </button>
              <button
                type="button"
                onClick={() => setPraticagemFilter("prolong")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shrink-0 cursor-pointer ${
                  praticagemFilter === "prolong"
                    ? "bg-[#102d40] text-white border-[#102d40] shadow-sm"
                    : "bg-white text-[#526871] border-[#d8e2e5] hover:bg-[#f6f9fa]"
                }`}
                style={praticagemFilter === "prolong" ? { color: "#ffffff" } : {}}
              >
                Prolongamento ({liveManeuvers.filter((m) => (m.berthTo || "").toUpperCase().includes("PROLONG")).length})
              </button>
              <button
                type="button"
                onClick={() => setPraticagemFilter("tecon1")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shrink-0 cursor-pointer ${
                  praticagemFilter === "tecon1"
                    ? "bg-[#102d40] text-white border-[#102d40] shadow-sm"
                    : "bg-white text-[#526871] border-[#d8e2e5] hover:bg-[#f6f9fa]"
                }`}
                style={praticagemFilter === "tecon1" ? { color: "#ffffff" } : {}}
              >
                Tecon 1 ({liveManeuvers.filter((m) => (m.berthTo || "").toUpperCase().includes("TECONT1")).length})
              </button>
            </div>

            {/* List Table / Cards */}
            <div className="flex-1 overflow-y-auto border border-[#e1e9ec] rounded-lg divide-y divide-[#edf2f4]">
              {loadingPraticagem ? (
                <div className="p-12 text-center text-[#74878f] text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#16869a]" />
                  <span>Carregando dados da Praticagem RJ...</span>
                </div>
              ) : filteredPraticagem.length === 0 ? (
                <div className="p-12 text-center text-[#74878f] text-xs">
                  Nenhuma manobra encontrada com os filtros selecionados.
                </div>
              ) : (
                filteredPraticagem.map((m, idx) => {
                  const isArrival = m.maneuver === "E";
                  const isShift = m.maneuver === "M";
                  const isDeparture = m.maneuver === "S";
                  const berthDisplay = m.berthTo || m.berthFrom || "Não informado";

                  return (
                    <div
                      key={`${m.name}-${m.dateTime}-${idx}`}
                      className="p-4 hover:bg-[#f7fafb] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-[#eef6f8] text-[#16869a] flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 border border-[#d3e5ea]">
                          <Ship className="w-5 h-5 text-[#16869a]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#102d40] text-base tracking-tight">
                              {m.name}
                            </span>
                            {/* Maneuver badge */}
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isArrival
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isShift
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {isArrival ? "Entrada" : isShift ? "Mudança" : isDeparture ? "Saída" : m.maneuver}
                            </span>

                            {/* Berth badge */}
                            <span className="bg-[#eef5f8] text-[#18465a] border border-[#cbdee5] text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
                              <Anchor className="w-3 h-3 text-[#16869a]" />
                              {berthDisplay}
                            </span>

                            {/* Date/time badge */}
                            <span className="text-[11px] text-[#556b75] font-semibold flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#8799a1]" />
                              {m.dateTime}
                            </span>
                          </div>

                          {/* Technical measurements */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#556972] flex-wrap">
                            <span className="font-medium text-[#1f3c49]">
                              LOA: <strong className="text-[#16869a] font-bold">{m.loa ? `${m.loa.toFixed(1)} m` : "—"}</strong>
                            </span>
                            <span className="text-gray-300">·</span>
                            <span>
                              Boca: <strong className="text-[#203a46]">{m.beam ? `${m.beam.toFixed(1)} m` : "—"}</strong>
                            </span>
                            <span className="text-gray-300">·</span>
                            <span>
                              Calado: <strong className="text-[#203a46]">{m.draft ? `${m.draft.toFixed(1)} m` : "—"}</strong>
                            </span>
                            <span className="text-gray-300">·</span>
                            <span>
                              Bordo:{" "}
                              <strong className={m.berthingSide === "boreste" ? "text-amber-700" : "text-blue-700"}>
                                {m.berthingSide === "boreste" ? "Boreste (BE)" : "Bombordo (BB)"}
                              </strong>
                            </span>
                            {m.imo && (
                              <>
                                <span className="text-gray-300">·</span>
                                <span className="text-[#7c8f96]">IMO: {m.imo}</span>
                              </>
                            )}
                            {m.type && (
                              <>
                                <span className="text-gray-300">·</span>
                                <span className="text-[#7c8f96] truncate max-w-[180px]">{m.type}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Add Button with high-contrast bright white text */}
                      <button
                        type="button"
                        onClick={() => handleAddFromPraticagem(m)}
                        className="px-4 py-2 bg-[#16869a] hover:bg-[#126f7f] rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all flex-shrink-0 active:scale-95 cursor-pointer font-bold text-xs"
                        style={{ color: "#ffffff", backgroundColor: "#16869a" }}
                      >
                        <Plus className="w-4 h-4 text-white" />
                        <span style={{ color: "#ffffff" }}>Adicionar ao Cenário</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-2.5 text-[10px] text-[#71858e] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#16869a] flex-shrink-0" />
              <span>Navios que vão atracar no Terminal têm seus dados técnicos gravados automaticamente na lista de Navios Salvos.</span>
            </div>
          </div>
        )}

        {/* Tab 2: Saved Vessels (Navios Salvos do Terminal) */}
        {activeTab === "catalog" && (
          <div className="flex-1 min-h-0 flex flex-col p-5 bg-white overflow-hidden">
            {/* Toolbar (shrink-0) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar navio salvo por nome, IMO, tipo..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a] bg-white shadow-xs"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 justify-end">
                <input
                  type="file"
                  ref={catalogImportRef}
                  onChange={handleCatalogImport}
                  accept=".json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => catalogImportRef.current?.click()}
                  className="px-3.5 py-2 bg-[#f4f7f8] hover:bg-[#e7ecef] text-[#3e5661] border border-[#d2dde1] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Importar lista de navios salvos de um arquivo JSON"
                >
                  <Upload className="w-3.5 h-3.5 text-gray-500" />
                  <span>Importar JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportCatalogJson(catalog)}
                  className="px-3.5 py-2 bg-[#f4f7f8] hover:bg-[#e7ecef] text-[#3e5661] border border-[#d2dde1] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Exportar navios salvos como arquivo JSON"
                >
                  <Download className="w-3.5 h-3.5 text-gray-500" />
                  <span>Exportar JSON ({catalog.length})</span>
                </button>
              </div>
            </div>

            {/* Saved Vessels List */}
            <div className="flex-1 min-h-0 overflow-y-auto border border-[#e1e9ec] rounded-lg divide-y divide-[#edf2f4]">
              {loadingCatalog ? (
                <div className="p-12 text-center text-[#74878f] text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#16869a]" />
                  <span>Carregando navios salvos...</span>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="p-12 text-center text-[#74878f] text-xs">
                  {catalogSearch ? "Nenhum navio encontrado com essa busca." : "Nenhum navio salvo ainda. Navios programados para o Terminal são adicionados automaticamente ao sincronizar."}
                </div>
              ) : (
                filteredCatalog.map((v) => (
                  <div
                    key={v.name}
                    className="p-3.5 hover:bg-[#f7fafb] transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#ebf3f5] text-[#1a445d] flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 border border-[#d6e4e8]">
                        <Ship className="w-4 h-4 text-[#16869a]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#102d40] text-sm tracking-tight truncate">
                            {v.name}
                          </span>
                          {v.type && (
                            <span className="bg-[#f0f4f7] text-[#2c4c5a] border border-[#d8e2e6] text-[10px] font-semibold px-2 py-0.5 rounded-md">
                              {v.type}
                            </span>
                          )}
                          {v.lastBerth && (
                            <span className="text-[10px] text-[#637780] font-medium flex items-center gap-1">
                              <Anchor className="w-2.5 h-2.5 text-gray-400" />
                              Último: {v.lastBerth}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#556972] flex-wrap">
                          <span className="font-semibold text-[#1f3c49]">
                            LOA: <span className="font-bold text-[#16869a]">{v.loa.toFixed(1)} m</span>
                          </span>
                          <span>·</span>
                          <span>
                            Boca: <strong>{v.beam.toFixed(1)} m</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Calado: <strong>{v.draft.toFixed(1)} m</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Bordo padrão:{" "}
                            <strong className={v.berthingSide === "boreste" ? "text-amber-700" : "text-blue-700"}>
                              {v.berthingSide === "boreste" ? "Boreste (BE)" : "Bombordo (BB)"}
                            </strong>
                          </span>
                          {v.imo && (
                            <>
                              <span>·</span>
                              <span className="text-[#7c8f96]">IMO: {v.imo}</span>
                            </>
                          )}
                          {v.updatedAt && (
                            <>
                              <span>·</span>
                              <span className="text-[#8e9fa5] text-[10px]">Atualizado: {v.updatedAt}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`Remover "${v.name}" da lista de Navios Salvos?`)) {
                            const updated = await deleteVesselFromCatalog(v.name);
                            setCatalog(updated);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover de Navios Salvos"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddFromCatalog(v)}
                        className="px-4 py-2 bg-[#16869a] hover:bg-[#126f7f] rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all flex-shrink-0 active:scale-95 cursor-pointer font-bold text-xs"
                        style={{ color: "#ffffff", backgroundColor: "#16869a" }}
                      >
                        <Plus className="w-4 h-4 text-white" />
                        <span style={{ color: "#ffffff" }}>Adicionar ao Cenário</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Manual Entry */}
        {activeTab === "manual" && (
          <form onSubmit={handleManualSubmit} className="flex-1 min-h-0 p-6 bg-white overflow-y-auto">
            <div className="max-w-xl mx-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                  Nome da Embarcação
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex.: MSC ILONA, COSCO PACIFIC..."
                  className="w-full px-3 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                    Comprimento (LOA)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      required
                      value={manualLoa}
                      onChange={(e) => setManualLoa(Number(e.target.value))}
                      className="w-full pl-3 pr-8 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">m</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                    Boca (Largura)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      required
                      value={manualBeam}
                      onChange={(e) => setManualBeam(Number(e.target.value))}
                      className="w-full pl-3 pr-8 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">m</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                    Calado
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      required
                      value={manualDraft}
                      onChange={(e) => setManualDraft(Number(e.target.value))}
                      className="w-full pl-3 pr-8 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">m</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                  Tipo de Embarcação (Planta Blueprint)
                </label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as VesselType)}
                  className="w-full px-3 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a] bg-white font-medium text-[#1e293b]"
                >
                  <option value="container">Porta-Contêineres (Container Ship) — Baías de contêineres e castelo de ré</option>
                  <option value="general-cargo">Carga Geral / Graneleiro (General Cargo Ship) — Porões com escotilhas e guindastes</option>
                  <option value="tanker">Petroleiro / Químico (Chemical/Products Tanker) — Manifold, tubulações e domos</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                    Bordo de Atracação (Voltado para o Cais)
                  </label>
                  <select
                    value={manualSide}
                    onChange={(e) => setManualSide(e.target.value as BerthingSide)}
                    className="w-full px-3 py-2 text-xs border border-[#cfdce0] rounded-lg focus:outline-none focus:border-[#16869a] bg-white"
                  >
                    <option value="boreste">Boreste (BE) — Proa voltada para a direita</option>
                    <option value="bombordo">Bombordo (BB) — Proa voltada para a esquerda</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2d4b58] mb-1">
                    Cor no Blueprint
                  </label>
                  <div className="flex items-center gap-2 h-[34px]">
                    {(["blue", "teal", "orange", "violet"] as VesselColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setManualColor(c)}
                        className={`flex-1 h-full rounded-lg border-2 transition-all flex items-center justify-center ${
                          manualColor === c ? "border-[#102d40] scale-105 shadow-sm" : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: VESSEL_COLORS[c].fill }}
                        title={VESSEL_COLORS[c].label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Checkbox Save to Catalog */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2c4754] font-medium bg-[#f5f9fa] p-3 rounded-lg border border-[#e0ebee]">
                  <input
                    type="checkbox"
                    checked={saveToCatalog}
                    onChange={(e) => setSaveToCatalog(e.target.checked)}
                    className="w-4 h-4 text-[#16869a] rounded border-gray-300 focus:ring-[#16869a]"
                  />
                  <span>
                    Salvar automaticamente este navio na lista de <strong>Navios Salvos</strong> para reutilizar em futuras simulações sem precisar recadastrar.
                  </span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 border border-[#cfdce0] rounded-lg text-xs font-semibold text-[#5a717c] hover:bg-[#f3f7f8]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#16869a] hover:bg-[#126f7f] rounded-lg flex items-center gap-2 shadow-sm cursor-pointer font-bold text-xs"
                  style={{ color: "#ffffff", backgroundColor: "#16869a" }}
                >
                  <Plus className="w-4 h-4 text-white" />
                  <span style={{ color: "#ffffff" }}>Adicionar ao Cenário</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
