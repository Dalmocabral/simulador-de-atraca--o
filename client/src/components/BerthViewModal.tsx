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
  Layers,
  Box,
  Sparkles,
} from "lucide-react";
import BerthBlueprint from "@/components/berth-blueprint";
import Berth2DThreeView from "@/components/Berth2DThreeView";
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
  const [renderMode, setRenderMode] = useState<"three" | "svg">("three"); // Padrão: Three.js 2D Alta Fidelidade
  const [zoom, setZoom] = useState(1.5); // Padrão 150%
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportThreeRef = useRef<((format?: "jpeg" | "png") => Promise<string | null>) | null>(null);

  async function handleShare() {
    setIsExporting(true);
    const vesselName = scenario.vessels.map((v) => v.name).filter(Boolean).join(" - ");

    // Se estiver em modo Three.js, captura diretamente do canvas WebGL
    if (renderMode === "three" && exportThreeRef.current) {
      try {
        const dataUrl = await exportThreeRef.current("png");
        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `plano_atracacao_3d_${Date.now()}.png`, { type: "image/png" });

          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "Plano de Atracação · Terminal Rio",
              text: `Plano de Atracação (${vesselName || scenario.name}) gerado pelo CaisLab.`,
              files: [file],
            });
          } else {
            // Copiar para o clipboard
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            alert("Imagem em alta definição copiada para a área de transferência! Cole no WhatsApp com Ctrl+V.");
          }
          setIsExporting(false);
          return;
        }
      } catch (err) {
        console.warn("Fallback para exportador padrão:", err);
      }
    }

    await exportAndShareBerthImage({
      containerElement: containerRef.current,
      scenarioName: scenario.name,
      vesselName,
      downloadOnly: false,
    });
    setIsExporting(false);
  }

  async function handleDownload(format: "jpeg" | "png" = "jpeg") {
    setIsDownloading(true);
    const vesselName = scenario.vessels.map((v) => v.name).filter(Boolean).join(" - ");

    // Se estiver em modo Three.js, baixa diretamente a imagem em alta qualidade
    if (renderMode === "three" && exportThreeRef.current) {
      try {
        const dataUrl = await exportThreeRef.current(format);
        if (dataUrl) {
          const a = document.createElement("a");
          a.href = dataUrl;
          const ext = format === "png" ? "png" : "jpg";
          a.download = `plano_atracacao_2d_threejs_${vesselName || scenario.name}_${Date.now()}.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setIsDownloading(false);
          return;
        }
      } catch (err) {
        console.warn("Fallback para download SVG:", err);
      }
    }

    await exportAndShareBerthImage({
      containerElement: containerRef.current,
      scenarioName: scenario.name,
      vesselName,
      downloadOnly: true,
      format,
      scale: 4.5,
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
        {/* Barra de Título Superior */}
        <header className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-sm sm:text-base font-bold text-white tracking-tight">
              Visualização 2D · Plano de Atracação
            </span>
            <span className="text-[11px] font-medium text-slate-400 hidden lg:inline">
              · {scenario.name} ({scenario.vessels.length} navio{scenario.vessels.length === 1 ? "" : "s"} atracado{scenario.vessels.length === 1 ? "" : "s"})
            </span>

            {/* Alternador de Motor: Three.js Alta Fidelidade vs Blueprint SVG */}
            <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 ml-2">
              <button
                type="button"
                onClick={() => setRenderMode("three")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  renderMode === "three"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Visualização 2D com Three.js (Modelos fiéis: Contêiner, Petroleiro com Manifold, Carga Geral com Guindastes, Offshore e Portêineres)"
              >
                <Sparkles size={13} className={renderMode === "three" ? "text-amber-300" : ""} />
                <span>Three.js 2D</span>
              </button>
              <button
                type="button"
                onClick={() => setRenderMode("svg")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  renderMode === "svg"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Blueprint Técnico Vetorial SVG com cotas lineares"
              >
                <span>SVG Técnico</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Controles de Zoom para modo SVG */}
            {renderMode === "svg" && (
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
                  onClick={() => setZoom(1.5)}
                  className="px-2 py-0.5 text-xs font-mono font-bold text-cyan-400 hover:text-white hover:bg-slate-700 rounded transition"
                  title="Restaurar zoom padrão 150%"
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
            )}

            {/* Botões Salvar Imagem Diretamente no PC */}
            <button
              type="button"
              onClick={() => handleDownload("jpeg")}
              disabled={isDownloading || isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white border border-slate-600/90 font-bold rounded-lg text-xs shadow-sm transition disabled:opacity-50 select-none cursor-pointer"
              title="Baixar imagem em Ultra Alta Definição (JPG ~3MB / 300 DPI / 4700px)"
            >
              <Download size={14} className="text-cyan-400" />
              <span>{isDownloading ? "Salvando..." : "Salvar no PC (HD)"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload("png")}
              disabled={isDownloading || isExporting}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/60 font-semibold rounded-lg text-xs shadow-sm transition disabled:opacity-50 select-none cursor-pointer"
              title="Baixar cópia sem perdas em formato PNG 4K"
            >
              <span>PNG 4K</span>
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

        {/* Área Central: Three.js 2D Alta Fidelidade ou SVG Técnico */}
        <div
          ref={containerRef}
          className="berth-full-window-view relative flex-1 w-full h-full overflow-hidden bg-[#eef4f7]"
        >
          {/* Logotipo da empresa/terminal no canto superior esquerdo */}
          <div className="absolute top-3 left-4 z-40 pointer-events-none select-none">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-10 sm:h-12 w-auto object-contain opacity-90"
            />
          </div>

          {renderMode === "three" ? (
            <Berth2DThreeView
              scenario={scenario}
              selectedVesselId={selectedVesselId}
              onSelectVessel={onSelectVessel}
              exportTriggerRef={exportThreeRef}
            />
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
