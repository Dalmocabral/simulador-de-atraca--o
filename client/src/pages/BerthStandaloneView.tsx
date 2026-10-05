import React, { useState, useEffect, useRef } from "react";
import {
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  Share2,
  Download,
} from "lucide-react";
import BerthBlueprint from "@/components/berth-blueprint";
import {
  readScenario,
  STORAGE_KEY,
  type Scenario,
} from "@/lib/berth-model";
import { exportAndShareBerthImage } from "@/lib/export-image";

export default function BerthStandaloneView() {
  const [scenario, setScenario] = useState<Scenario>(() => readScenario());
  const [zoom, setZoom] = useState(1.5);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
    if (isExporting || isDownloading) return;
    setIsExporting(true);
    try {
      const primaryVessel = scenario.vessels[0]?.name;
      await exportAndShareBerthImage({
        containerElement: containerRef.current,
        scenarioName: scenario.name,
        vesselName: primaryVessel,
        downloadOnly: false,
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDownload(format: "jpeg" | "png" = "jpeg") {
    if (isExporting || isDownloading) return;
    setIsDownloading(true);
    try {
      const primaryVessel = scenario.vessels[0]?.name;
      await exportAndShareBerthImage({
        containerElement: containerRef.current,
        scenarioName: scenario.name,
        vesselName: primaryVessel,
        downloadOnly: true,
        format,
        scale: 4.5,
      });
    } finally {
      setIsDownloading(false);
    }
  }

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

  // Sincronizar com atualizações de outras abas via storage event
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          setScenario(updated);
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f172a] text-slate-100 overflow-hidden select-none">
      {/* Barra de Título Superior */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
          >
            <ArrowLeft size={14} /> Voltar ao Simulador
          </a>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <span>View Atracação</span>
            <span className="text-xs font-normal text-slate-400">· {scenario.name}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Controles de Zoom */}
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
        </div>
      </header>

      {/* Layout do cais pegando toda a janela */}
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
          selectedVesselId={null}
          onSelectVessel={() => {}}
          onMoveVessel={() => {}}
          onAssignMooringLine={() => {}}
          isPresentationMode={true}
        />
      </div>
    </div>
  );
}
