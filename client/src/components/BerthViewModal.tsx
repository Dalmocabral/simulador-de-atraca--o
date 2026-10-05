import React, { useState, useEffect, useRef } from "react";
import {
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Share2,
  Download,
} from "lucide-react";
import BerthBlueprint from "@/components/berth-blueprint";
import { type Scenario } from "@/lib/berth-model";
import { exportAndShareBerthImage } from "@/lib/export-image";

interface BerthViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
  selectedVesselId: string | null;
  onSelectVessel: (id: string) => void;
  onMoveVessel: (id: string, position: number) => void;
  onAssignMooringLine: (vesselId: string, lineId: string, bollardId: string) => void;
  onUpdateBollard?: (id: string, patch: any) => void;
  onMovePortainer?: (id: string, position: number) => void;
  onPortainerLimitHit?: (message: string) => void;
}

export default function BerthViewModal({
  isOpen,
  onClose,
  scenario,
  selectedVesselId,
  onSelectVessel,
  onMoveVessel,
  onAssignMooringLine,
  onUpdateBollard,
  onMovePortainer,
  onPortainerLimitHit,
}: BerthViewModalProps) {
  const [isMaximized, setIsMaximized] = useState(true); // Abre em tela cheia
  const [zoom, setZoom] = useState(2.04); // Padrão 204% conforme solicitado
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
    setIsExporting(true);
    const vesselName = scenario.vessels.map((v) => v.name).filter(Boolean).join(" - ");
    await exportAndShareBerthImage({
      containerElement: containerRef.current,
      scenarioName: scenario.name,
      vesselName,
      downloadOnly: false,
    });
    setIsExporting(false);
  }

  async function handleDownload() {
    setIsDownloading(true);
    const vesselName = scenario.vessels.map((v) => v.name).filter(Boolean).join(" - ");
    await exportAndShareBerthImage({
      containerElement: containerRef.current,
      scenarioName: scenario.name,
      vesselName,
      downloadOnly: true,
    });
    setIsDownloading(false);
  }

  // Calcula o zoom para preencher largura da janela quando o usuário desejar
  function fitToWindow() {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const total = scenario.segments.reduce((sum, seg) => sum + Math.max(0, seg.length), 0);
    const scale = Math.max(0.68, 900 / Math.max(total, 1));
    const blueprintBaseWidth = total * scale + 108;
    if (blueprintBaseWidth > 0 && containerWidth > 0) {
      const targetZoom = Number(((containerWidth - 24) / blueprintBaseWidth).toFixed(2));
      setZoom(Math.max(0.5, Math.min(3.5, targetZoom)));
    }
  }

  // Tecla ESC para fechar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs select-none">
      <div
        className={`bg-[#0f172a] text-slate-100 flex flex-col overflow-hidden shadow-2xl border border-slate-700/80 transition-all duration-150 ${
          isMaximized
            ? "fixed inset-0 w-screen h-screen rounded-none z-50"
            : "w-[98vw] h-[95vh] rounded-xl"
        }`}
      >
        {/* Barra de Título Superior Compacta */}
        <header className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-sm sm:text-base font-bold text-white tracking-tight">
              View Atracação
            </span>
            <span className="text-[11px] font-medium text-slate-400 hidden md:inline">
              · {scenario.name} ({scenario.vessels.length} navio{scenario.vessels.length === 1 ? "" : "s"} atracado{scenario.vessels.length === 1 ? "" : "s"})
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Controles de Zoom & Padrão 204% */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-slate-300">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))))}
                className="p-1.5 hover:text-white hover:bg-slate-700 rounded transition"
                title="Diminuir Zoom"
              >
                <ZoomOut size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(2.04)}
                className="px-2 py-0.5 text-xs font-mono font-bold text-cyan-400 hover:text-white hover:bg-slate-700 rounded transition"
                title="Restaurar zoom padrão 204%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(2))))}
                className="p-1.5 hover:text-white hover:bg-slate-700 rounded transition"
                title="Aumentar Zoom"
              >
                <ZoomIn size={15} />
              </button>
              <button
                type="button"
                onClick={fitToWindow}
                className="px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-700 border-l border-slate-700 rounded-r transition ml-0.5"
                title="Ajustar à largura da janela"
              >
                Ajustar
              </button>
            </div>

            {/* Botão Salvar Imagem Diretamente no PC */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white border border-slate-600/90 font-bold rounded-lg text-xs shadow-sm transition disabled:opacity-50 select-none cursor-pointer"
              title="Baixar imagem do cais em alta definição diretamente no seu PC"
            >
              <Download size={14} className="text-cyan-400" />
              <span>{isDownloading ? "Salvando..." : "Salvar no PC"}</span>
            </button>

            {/* Botão Compartilhar Imagem em Alta Definição para WhatsApp */}
            <button
              type="button"
              onClick={handleShare}
              disabled={isDownloading || isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold rounded-lg text-xs shadow-sm transition disabled:opacity-50 select-none cursor-pointer"
              title="Salvar e compartilhar imagem em alta definição para WhatsApp"
            >
              <Share2 size={14} className="text-slate-950" />
              <span>{isExporting ? "Gerando..." : "Compartilhar"}</span>
            </button>

            {/* Alternar Janela / Tela Cheia */}
            <button
              type="button"
              onClick={() => setIsMaximized((m) => !m)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/60 transition"
              title={isMaximized ? "Reduzir janela" : "Maximizar para tela cheia"}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-red-950/80 hover:border-red-700/80 rounded-lg border border-slate-700/60 transition"
              title="Fechar (Esc)"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        {/* Imagem / Layout do cais pegando toda a janela */}
        <div
          ref={containerRef}
          className="berth-full-window-view relative flex-1 w-full h-full overflow-hidden bg-[#eef4f7]"
        >
          {/* Logotipo da empresa/terminal no canto superior esquerdo (sem sombra e sem bordas) */}
          <div className="absolute top-3 left-4 z-40 pointer-events-none select-none">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-10 sm:h-12 w-auto object-contain"
            />
          </div>

          <BerthBlueprint
            scenario={scenario}
            zoom={zoom}
            selectedVesselId={selectedVesselId}
            onSelectVessel={onSelectVessel}
            onMoveVessel={onMoveVessel}
            onAssignMooringLine={onAssignMooringLine}
            onUpdateBollard={onUpdateBollard}
            onMovePortainer={onMovePortainer}
            onPortainerLimitHit={onPortainerLimitHit}
            isPresentationMode={true}
          />
        </div>
      </div>
    </div>
  );
}
