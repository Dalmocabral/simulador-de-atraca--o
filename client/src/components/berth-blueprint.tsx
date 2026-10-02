import { useRef, useState } from "react";
import {
  calculateIssues,
  berthwiseOffsetFromStern,
  bollardDisplayPositions,
  CONTAINER_COLORS,
  normalizeMooringOffset,
  MOORING_LINE_LABELS,
  segmentOffsets,
  type Scenario,
  VESSEL_COLORS,
  type BollardType,
  BOLLARD_TYPES,
} from "@/lib/berth-model";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BerthBlueprintProps {
  scenario: Scenario;
  zoom: number;
  selectedVesselId: string | null;
  onSelectVessel: (id: string) => void;
  onMoveVessel: (id: string, position: number) => void;
  onAssignMooringLine: (vesselId: string, lineId: string, bollardId: string) => void;
  onUpdateBollard?: (id: string, patch: { id?: string; position?: number | null; type?: BollardType }) => void;
}

const PAD = 54;
const HEIGHT = 320;
const QUAY_Y = 218;
const CABLE_END_Y = 205;
const VESSEL_BERTH_BOTTOM_Y = QUAY_Y - 55; // 55 px de distância do cais (metade dos 110 px)

export default function BerthBlueprint({
  scenario,
  zoom,
  selectedVesselId,
  onSelectVessel,
  onMoveVessel,
  onAssignMooringLine,
  onUpdateBollard,
}: BerthBlueprintProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<
    | { kind: "vessel"; id: string; grabOffset: number }
    | { kind: "mooring"; vesselId: string; lineId: string }
    | null
  >(null);
  const [activeBollardId, setActiveBollardId] = useState<string | null>(null);
  const [editingBollardId, setEditingBollardId] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [editType, setEditType] = useState<BollardType>("duplo");
  const [editPosition, setEditPosition] = useState<string>("");
  const [lineDragPoint, setLineDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoveredBollardId, setHoveredBollardId] = useState<string | null>(null);
  const total = scenario.segments.reduce((sum, segment) => sum + Math.max(0, segment.length), 0);
  const scale = Math.max(0.68, 900 / Math.max(total, 1));
  const width = total * scale + PAD * 2;
  const trackStart = PAD;
  const trackEnd = PAD + total * scale;
  const tickEvery = total > 1500 ? 100 : 50;
  const offsets = segmentOffsets(scenario.segments);
  const sortedVessels = [...scenario.vessels].sort((a, b) => a.position - b.position);
  const bollardById = new Map(scenario.bollards.map((bollard) => [bollard.id, bollard]));
  const bollardDisplays = bollardDisplayPositions(scenario.bollards, total);
  const bollardDisplayById = new Map(bollardDisplays.map((bollard) => [bollard.id, bollard]));
  const hoveredDisplay = hoveredBollardId ? bollardDisplayById.get(hoveredBollardId) : null;
  const hoveredBollard = hoveredBollardId ? bollardById.get(hoveredBollardId) : null;
  const issueByVessel = new Map<string, string[]>();
  for (const issue of calculateIssues(scenario)) {
    issueByVessel.set(issue.vesselId, [...(issueByVessel.get(issue.vesselId) ?? []), issue.message]);
  }

  const mooredLinesByBollardId = new Map<string, { vesselName: string; lineType: string }[]>();
  scenario.vessels.forEach((vessel) => {
    vessel.mooringLines.forEach((line) => {
      if (line.bollardId) {
        const list = mooredLinesByBollardId.get(line.bollardId) ?? [];
        list.push({ vesselName: vessel.name, lineType: MOORING_LINE_LABELS[line.type] || line.type });
        mooredLinesByBollardId.set(line.bollardId, list);
      }
    });
  });

  function pointAt(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function positionAt(clientX: number) {
    return (pointAt(clientX, 0).x - PAD) / scale;
  }

  function nearestBollard(x: number) {
    let nearest = bollardDisplays[0] ?? null;
    for (const bollard of bollardDisplays.slice(1)) {
      if (!nearest || Math.abs(trackStart + bollard.position * scale - x) < Math.abs(trackStart + nearest.position * scale - x)) nearest = bollard;
    }
    return nearest;
  }

  function onPointerDown(event: React.PointerEvent<SVGGElement>, id: string, position: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    onSelectVessel(id);
    dragRef.current = { kind: "vessel", id, grabOffset: positionAt(event.clientX) - position };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function startMooringDrag(event: React.PointerEvent<SVGCircleElement>, vesselId: string, lineId: string, x: number, y: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind: "mooring", vesselId, lineId };
    setLineDragPoint({ x, y });
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function moveMooringToAdjacentBollard(event: React.KeyboardEvent<SVGCircleElement>, currentBollardId: string | null, vesselId: string, lineId: string) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = bollardDisplays.findIndex((item) => item.id === currentBollardId);
    const nextIndex = currentIndex < 0
      ? (event.key === "ArrowRight" ? 0 : bollardDisplays.length - 1)
      : Math.max(0, Math.min(bollardDisplays.length - 1, currentIndex + (event.key === "ArrowRight" ? 1 : -1)));
    const next = bollardDisplays[nextIndex];
    if (next) onAssignMooringLine(vesselId, lineId, next.id);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "vessel") {
      const next = positionAt(event.clientX) - drag.grabOffset;
      onMoveVessel(drag.id, Math.round(next * 10) / 10);
    } else {
      setLineDragPoint(pointAt(event.clientX, event.clientY));
    }
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag?.kind === "mooring") {
      const point = pointAt(event.clientX, event.clientY);
      const target = nearestBollard(point.x);
      if (target && point.y >= QUAY_Y - 38 && point.y <= QUAY_Y + 38) {
        onAssignMooringLine(drag.vesselId, drag.lineId, target.id);
        setActiveBollardId(target.id);
      }
      setLineDragPoint(null);
    }
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  function onPointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    setLineDragPoint(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  const dragTarget = lineDragPoint ? nearestBollard(lineDragPoint.x) : null;

  const ticks: number[] = [];
  for (let meter = 0; meter <= total; meter += tickEvery) ticks.push(meter);
  if (ticks[ticks.length - 1] !== total && total > 0) ticks.push(total);

  return (
    <div className="blueprint-scroll" aria-label="Blueprint do cais; arraste um navio para ajustar sua posição ou a ponta de um cabo para escolher o cabeço">
      <div style={{ position: "relative", width: width * zoom, height: HEIGHT * zoom, display: "inline-block" }}>
        <svg
        ref={svgRef}
        className="blueprint-svg"
        width={width * zoom}
        height={HEIGHT * zoom}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="group"
        aria-label={`Vista superior de ${scenario.vessels.length} navios e ${scenario.bollards.length} cabeços numerados de 399 a 367 em um cais de ${total} metros`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <defs>
          <pattern id="water-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#dcebf0" strokeWidth="0.65" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={width} height={HEIGHT} fill="#f8fbfc" />
        <rect x={trackStart} y="32" width={total * scale} height={QUAY_Y - 32} fill="#eef7f8" />
        <rect x={trackStart} y="32" width={total * scale} height={QUAY_Y - 32} fill="url(#water-grid)" />

        {scenario.clearance > 0 && (
          <>
            <rect x={trackStart} y="32" width={scenario.clearance * scale} height={QUAY_Y - 32} fill="#f9ebd8" opacity="0.65" />
            <rect x={trackEnd - scenario.clearance * scale} y="32" width={scenario.clearance * scale} height={QUAY_Y - 32} fill="#f9ebd8" opacity="0.65" />
          </>
        )}

        {ticks.map((meter) => {
          const x = trackStart + meter * scale;
          return (
            <g key={`tick-${meter}`}>
              <line x1={x} y1="33" x2={x} y2="221" stroke="#d1dde2" strokeDasharray="3 5" />
              <line x1={x} y1="27" x2={x} y2="35" stroke="#70858f" strokeWidth="1.5" />
              <text x={x} y="21" textAnchor="middle" className="blueprint-ruler-label">{meter} m</text>
            </g>
          );
        })}

        {/* Cabos amarelos; estações esquemáticas dos cabeços permanecem ilustrativas até o levantamento real. */}
        {sortedVessels.flatMap((vessel) => {
          const vesselHeight = Math.max(20, vessel.beam * scale);
          const y = VESSEL_BERTH_BOTTOM_Y - vesselHeight;
          return vessel.mooringLines.map((line) => {
            const bollard = line.bollardId ? bollardById.get(line.bollardId) : undefined;
            const offsetFromStern = normalizeMooringOffset(line.type, vessel.loa, line.shipOffset);
            const shipStation = vessel.position + berthwiseOffsetFromStern(vessel.loa, vessel.berthingSide, offsetFromStern);
            const shipX = trackStart + shipStation * scale;
            const bollardDisplay = bollard?.id ? bollardDisplayById.get(bollard.id) : undefined;
            const isDragging = dragRef.current?.kind === "mooring" && dragRef.current.vesselId === vessel.id && dragRef.current.lineId === line.id;
            const bollardX = bollardDisplay ? trackStart + bollardDisplay.position * scale : shipX;
            const endX = isDragging && lineDragPoint ? lineDragPoint.x : bollardX;
            const endY = isDragging && lineDragPoint ? lineDragPoint.y : CABLE_END_Y;
            const isSpring = line.type.startsWith("spring");
            const stationDescription = bollardDisplay?.estimated ? "estação ilustrativa, não levantada" : bollardDisplay ? `estação ${bollardDisplay.position} m` : "cabeço ainda não escolhido";
            return (
              <g key={`line-${vessel.id}-${line.id}`}>
                <title>{vessel.name} · {MOORING_LINE_LABELS[line.type]} · {bollard ? `Cabeço ${bollard.id} · ${stationDescription}` : stationDescription}</title>
                <line x1={shipX} y1={y + vesselHeight - 1} x2={endX} y2={endY} stroke="#51491d" strokeWidth="4.2" opacity="0.42" pointerEvents="none" />
                <line x1={shipX} y1={y + vesselHeight - 1} x2={endX} y2={endY} stroke="#f1cc19" strokeWidth="2.8" strokeDasharray={isSpring ? "5 3" : undefined} opacity="0.98" pointerEvents="none" />
                <circle cx={shipX} cy={y + vesselHeight - 1} r="3.4" fill="#f1cc19" stroke="#51491d" strokeWidth="1" pointerEvents="none" />
              </g>
            );
          });
        })}

        {sortedVessels.map((vessel, index) => {
          const x = trackStart + vessel.position * scale;
          const vesselWidth = vessel.loa * scale;
          const vesselHeight = Math.max(20, vessel.beam * scale);
          const y = VESSEL_BERTH_BOTTOM_Y - vesselHeight;
          const bowInset = Math.min(23 * scale, vesselWidth * 0.16);
          const color = VESSEL_COLORS[vessel.color];
          const messages = issueByVessel.get(vessel.id) ?? [];
          const isIssue = messages.length > 0;
          const isSelected = selectedVesselId === vessel.id;
          const cellRows = vesselHeight > 38 ? 3 : 2;
          const cellColumns = Math.max(2, Math.min(24, Math.floor(vessel.loa / 20)));
          const innerWidth = Math.max(0, vesselWidth - bowInset - 18);
          const cellWidth = innerWidth / cellColumns;
          const innerHeight = vesselHeight - 10;
          const cellHeight = innerHeight / cellRows;

          return (
            <g
              key={vessel.id}
              className={`ship-drag-group ${isSelected ? "is-selected" : ""} ${isIssue ? "has-issue" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${vessel.name}, ${vessel.loa} metros. Arraste para reposicionar.`}
              onPointerDown={(event) => onPointerDown(event, vessel.id, vessel.position)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); onMoveVessel(vessel.id, vessel.position - 5); }
                if (event.key === "ArrowRight") { event.preventDefault(); onMoveVessel(vessel.id, vessel.position + 5); }
              }}
              onClick={() => onSelectVessel(vessel.id)}
              style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
            >
              <title>
                {vessel.name} · LOA {vessel.loa} m · posição {vessel.position.toFixed(1)} m
                {messages.length ? ` · ${messages.join("; ")}` : ""}
              </title>
              {isSelected && <rect x={x - 5} y={y - 25} width={Math.max(18, vesselWidth + 10)} height={vesselHeight + 37} rx="9" fill="none" stroke="#16869a" strokeWidth="1.5" strokeDasharray="4 4" />}
              <text x={x + vesselWidth / 2} y={y - 21} textAnchor="middle" className="ship-side-label">{vessel.berthingSide === "bombordo" ? "BOMBORDO AO CAIS · PROA ←" : "BORESTE AO CAIS · PROA →"}</text>
              <text x={x + vesselWidth / 2} y={y - 10} textAnchor="middle" className={`ship-name ${isIssue ? "ship-name-issue" : ""}`}>
                {vessel.name.length > 26 ? `${vessel.name.slice(0, 24)}…` : vessel.name}
              </text>
              <g transform={vessel.berthingSide === "bombordo" ? `translate(${2 * x + vesselWidth}, 0) scale(-1, 1)` : undefined}>
                <path d={`M ${x + 6} ${y} Q ${x} ${y + vesselHeight / 2} ${x + 6} ${y + vesselHeight} L ${x + vesselWidth - bowInset} ${y + vesselHeight} L ${x + vesselWidth} ${y + vesselHeight / 2} L ${x + vesselWidth - bowInset} ${y} Z`} fill="#f7fafb" stroke={isIssue ? "#bd4540" : color.stroke} strokeWidth={isIssue ? 3 : 2} strokeDasharray={isIssue ? "7 4" : undefined} />
                {Array.from({ length: cellRows }, (_, row) =>
                  Array.from({ length: cellColumns }, (_, column) => {
                    const cellX = x + 9 + column * cellWidth;
                    const cellY = y + 5 + row * cellHeight;
                    if (cellX + cellWidth > x + vesselWidth - bowInset - 3) return null;
                    return <rect key={`${row}-${column}`} x={cellX} y={cellY} width={Math.max(1, cellWidth - 2)} height={Math.max(1, cellHeight - 2)} rx="1.2" fill={CONTAINER_COLORS[(row * 3 + column + index) % CONTAINER_COLORS.length]} stroke="#fff" strokeWidth="0.75" />;
                  }),
                )}
                <path d={`M ${x + vesselWidth - bowInset - 2} ${y + 3} L ${x + vesselWidth - 8} ${y + vesselHeight / 2} L ${x + vesselWidth - bowInset - 2} ${y + vesselHeight - 3}`} fill="none" stroke={color.stroke} strokeWidth="1.5" />
                <rect x={x + Math.max(9, vesselWidth * 0.14)} y={y + Math.max(5, vesselHeight * 0.28)} width={Math.max(31, vesselWidth * 0.14)} height={Math.max(10, vesselHeight * 0.44)} rx="2" fill={color.fill} stroke={color.stroke} strokeWidth="1" opacity="0.94" />
                <line x1={x + 7} y1={y + vesselHeight - 1} x2={x + vesselWidth - bowInset} y2={y + vesselHeight - 1} stroke={vessel.berthingSide === "bombordo" ? "#7566a8" : "#18849a"} strokeWidth="2" />
              </g>
              <line x1={x + vesselWidth / 2} y1={y + vesselHeight + 1} x2={x + vesselWidth / 2} y2={QUAY_Y - 4} stroke={isIssue ? "#bd4540" : color.stroke} strokeDasharray="3 4" opacity="0.58" />
              <circle cx={x + vesselWidth / 2} cy={QUAY_Y - 3} r="3.3" fill={isIssue ? "#bd4540" : color.fill} />
            </g>
          );
        })}

        {/* Marcação roxa na ponta da proa indicando o alinhamento da proa no cais */}
        {sortedVessels.map((vessel) => {
          const vesselHeight = Math.max(20, vessel.beam * scale);
          const y = VESSEL_BERTH_BOTTOM_Y - vesselHeight;
          const bowStation = vessel.berthingSide === "bombordo" ? vessel.position : vessel.position + vessel.loa;
          const bowX = trackStart + bowStation * scale;
          const bowY = y + vesselHeight / 2;
          return (
            <g key={`bow-marker-${vessel.id}`} pointerEvents="none">
              <title>{vessel.name} · Bico da proa na estação {bowStation.toFixed(1)} m no cais</title>
              <line
                x1={bowX}
                y1={bowY + 2}
                x2={bowX}
                y2={QUAY_Y - 3}
                stroke="#7566a8"
                strokeWidth="2"
                strokeDasharray="4 3"
                opacity="0.88"
              />
              <path
                d={`M ${bowX - 4.5} ${bowY + 10} L ${bowX} ${bowY + 2} L ${bowX + 4.5} ${bowY + 10} Z`}
                fill="#7566a8"
                stroke="#fff"
                strokeWidth="1"
              />
              <circle
                cx={bowX}
                cy={QUAY_Y - 3}
                r="3.3"
                fill="#7566a8"
                stroke="#fff"
                strokeWidth="1"
              />
              <text
                x={bowX}
                y={QUAY_Y - 7}
                textAnchor="middle"
                style={{
                  fill: "#5a4b8a",
                  fontSize: "5.8px",
                  fontWeight: 800,
                  paintOrder: "stroke",
                  stroke: "#ffffff",
                  strokeWidth: "2px",
                  strokeLinejoin: "round",
                }}
              >
                PROA {bowStation.toFixed(0)}m
              </text>
            </g>
          );
        })}

        {sortedVessels.slice(1).map((vessel, index) => {
          const previous = sortedVessels[index];
          const gap = vessel.position - (previous.position + previous.loa);
          const x1 = trackStart + (previous.position + previous.loa) * scale;
          const x2 = trackStart + vessel.position * scale;
          const mid = (x1 + x2) / 2;
          const warning = gap < scenario.clearance;
          return (
            <g key={`gap-${previous.id}-${vessel.id}`} className={warning ? "gap-measure gap-measure-warning" : "gap-measure"}>
              <line x1={x1} y1="145" x2={x2} y2="145" stroke={warning ? "#bd4540" : "#55727f"} strokeWidth="1.3" />
              {gap >= 0 && <path d={`M ${x1 + 5} 142 L ${x1} 145 L ${x1 + 5} 148 M ${x2 - 5} 142 L ${x2} 145 L ${x2 - 5} 148`} fill="none" stroke={warning ? "#bd4540" : "#55727f"} strokeWidth="1.1" />}
              <text x={mid} y="139" textAnchor="middle" className="gap-label">{gap.toFixed(0)} m</text>
            </g>
          );
        })}

        <rect x={trackStart} y={QUAY_Y} width={total * scale} height="22" fill="#8d9da3" />
        <rect x={trackStart} y={QUAY_Y} width={total * scale} height="4" fill="#637b84" />

        {/* Cabeços numerados com cores oficiais e numeração na vertical */}
        {bollardDisplays.map((display) => {
          const x = trackStart + display.position * scale;
          const isDropTarget = dragTarget?.id === display.id;
          const isHovered = hoveredBollardId === display.id;
          const bollard = bollardById.get(display.id);
          const bType: BollardType = bollard?.type || display.type || "duplo";
          const bConfig = BOLLARD_TYPES[bType] || BOLLARD_TYPES["duplo"];
          const positionText = display.estimated ? "posição esquemática, não levantada" : `estação ${display.position} m desde o início do cais`;
          return (
            <g
              key={`bollard-${display.id}`}
              className={`bollard-marker ${isHovered ? "bollard-marker-hover" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Cabeço ${display.id}, ${bConfig.label}, ${positionText}`}
              onPointerEnter={() => setHoveredBollardId(display.id)}
              onPointerLeave={() => setHoveredBollardId((curr) => (curr === display.id ? null : curr))}
              onClick={() => {
                setHoveredBollardId(null);
                setEditingBollardId(display.id);
                setEditId(display.id);
                setEditType(bType);
                setEditPosition(display.position !== null ? String(display.position) : "");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setHoveredBollardId(null);
                  setEditingBollardId(display.id);
                  setEditId(display.id);
                  setEditType(bType);
                  setEditPosition(display.position !== null ? String(display.position) : "");
                }
              }}
            >
              <title>Cabeço {display.id} ({bConfig.label}) · {positionText}</title>
              {/* Hitbox ampliada para o cursor e hover com mouse */}
              <rect
                x={x - 9}
                y="192"
                width="18"
                height="46"
                className="bollard-hitbox"
                fill="transparent"
                style={{ cursor: "pointer" }}
              />
              {/* Haste vertical do cabeço com ponta superior e base sobre o cais */}
              <line
                x1={x}
                y1="200"
                x2={x}
                y2="235"
                stroke={isHovered ? "#f1cc19" : "#111a1d"}
                strokeWidth={isHovered ? "2.6" : "2.2"}
              />
              {/* Cápsula arredondada do cabeço com a cor oficial do seu tipo */}
              <rect
                x={x - 4.3}
                y={205}
                width="8.6"
                height="19"
                rx="2.6"
                className="bollard-capsule"
                fill={isHovered ? "#f1cc19" : bConfig.color}
                stroke={isHovered ? "#594d12" : bConfig.border}
                strokeWidth={isHovered ? "1.4" : "0.9"}
              />
              {/* Numeração na vertical dentro do cabeço */}
              <text
                x={x}
                y={214.5}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(-90 ${x} 214.5)`}
                className={`bollard-number ${display.estimated ? "bollard-number-estimated" : ""}`}
                style={{
                  fill: isHovered ? "#111a1d" : "#ffffff",
                  fontSize: "6.2px",
                  fontWeight: 900,
                  letterSpacing: "0.2px",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {display.id}
              </text>
            </g>
          );
        })}

        {/* Cotas em metros entre cabeços adjacentes (ex: 19,8, 10,7, 25,0, 30,0) como na planta portuária */}
        {bollardDisplays.slice(0, -1).map((display, index) => {
          const next = bollardDisplays[index + 1];
          if (!next) return null;
          const x1 = trackStart + display.position * scale;
          const x2 = trackStart + next.position * scale;
          const dist = Math.abs(next.position - display.position);
          const midX = (x1 + x2) / 2;
          const pixelGap = Math.abs(x2 - x1);
          if (pixelGap < 16) return null;
          return (
            <g key={`gap-bollard-${display.id}-${next.id}`} pointerEvents="none">
              <text
                x={midX}
                y="228"
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: "#1f2937",
                  fontSize: "5.4px",
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  paintOrder: "stroke",
                  stroke: "#ffffff",
                  strokeWidth: "2.2px",
                  strokeLinejoin: "round",
                }}
              >
                {dist.toFixed(1).replace(".", ",")}
              </text>
            </g>
          );
        })}

        {/* Alças de cabo em camada superior para continuarem arrastáveis sobre os símbolos pretos. */}
        {sortedVessels.flatMap((vessel, vesselIndex) => vessel.mooringLines.map((line) => {
          const offsetFromStern = normalizeMooringOffset(line.type, vessel.loa, line.shipOffset);
          const display = line.bollardId ? bollardDisplayById.get(line.bollardId) : undefined;
          const shipStation = vessel.position + berthwiseOffsetFromStern(vessel.loa, vessel.berthingSide, offsetFromStern);
          const shipX = trackStart + shipStation * scale;
          const isDragging = dragRef.current?.kind === "mooring" && dragRef.current.vesselId === vessel.id && dragRef.current.lineId === line.id;
          const x = isDragging && lineDragPoint ? lineDragPoint.x : display ? trackStart + display.position * scale : shipX;
          const y = isDragging && lineDragPoint ? lineDragPoint.y : CABLE_END_Y;
          return (
            <g key={`line-handle-${vessel.id}-${line.id}`}>
              <circle cx={x} cy={y} r={isDragging ? 5.5 : 4.2} fill="#f1cc19" stroke="#51491d" strokeWidth="1.4" pointerEvents="none" />
              <circle
                cx={x}
                cy={y}
                r="12"
                fill="transparent"
                pointerEvents="all"
                role="button"
                tabIndex={0}
                aria-label={`Arraste a ponta da ${MOORING_LINE_LABELS[line.type]} até um cabeço numerado`}
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(event) => startMooringDrag(event, vessel.id, line.id, x, y)}
                onKeyDown={(event) => moveMooringToAdjacentBollard(event, line.bollardId, vessel.id, line.id)}
              />
              {isDragging && dragTarget && (
                <text x={x} y={QUAY_Y - 41} textAnchor="middle" className="bollard-drop-label">Soltar no {dragTarget.id}</text>
              )}
            </g>
          );
        }))}

        {offsets.map((segment, index) => {
          const x = trackStart + segment.start * scale;
          const segmentWidth = segment.length * scale;
          const shade = ["#e6caa5", "#e9d3b5", "#b9cbd0", "#d4e3e3"][index % 4];
          return (
            <g key={segment.id}>
              <rect x={x} y="240" width={segmentWidth} height="43" fill={shade} stroke="#fff" strokeWidth="2" />
              <text x={x + segmentWidth / 2} y="258" textAnchor="middle" className="segment-name">{segment.name.length > 20 ? `${segment.name.slice(0, 18)}…` : segment.name}</text>
              <text x={x + segmentWidth / 2} y="275" textAnchor="middle" className="segment-length">{segment.length} m · {segment.start}–{segment.end} m</text>
            </g>
          );
        })}
        <line x1={trackStart} y1="292" x2={trackEnd} y2="292" stroke="#94a7ad" strokeWidth="1" />
        <text x={trackStart} y="307" className="blueprint-footnote">INÍCIO DO CAIS · coordenadas longitudinais em metros</text>
        <text x={trackEnd} y="307" textAnchor="end" className="blueprint-footnote">{total} m · FIM DO CAIS</text>
      </svg>

      {/* Card flutuante com foto real e dados ao passar o mouse pelo cabeço */}
      {!editingBollardId && hoveredDisplay && (() => {
        const bType: BollardType = hoveredBollard?.type || hoveredDisplay.type || "duplo";
        const bConfig = BOLLARD_TYPES[bType] || BOLLARD_TYPES["duplo"];
        const bIndex = bollardDisplays.findIndex((b) => b.id === hoveredDisplay.id);
        const nextDisplay = bIndex >= 0 && bIndex < bollardDisplays.length - 1 ? bollardDisplays[bIndex + 1] : null;
        const distToNext = nextDisplay ? Math.abs(nextDisplay.position - hoveredDisplay.position) : null;
        const moored = mooredLinesByBollardId.get(hoveredDisplay.id) ?? [];
        const bollardPixelX = (trackStart + hoveredDisplay.position * scale) * zoom;
        const cardWidth = 270;
        const clampedX = Math.max(cardWidth / 2 + 10, Math.min(width * zoom - cardWidth / 2 - 10, bollardPixelX));
        const arrowOffset = bollardPixelX - clampedX;

        return (
          <div
            className="pointer-events-none absolute z-30 transition-all duration-150 ease-out"
            style={{
              left: clampedX,
              top: (QUAY_Y - 18) * zoom,
              transform: "translate(-50%, -100%)",
              width: cardWidth,
            }}
          >
            <div className="bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-2xl border border-[#cbd5e1] text-[#1e293b]">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#f1f5f9]">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full border shadow-xs shrink-0"
                    style={{ background: bConfig.color, borderColor: bConfig.border }}
                  />
                  <span className="font-extrabold text-sm text-[#0f172a]">Cabeço {hoveredDisplay.id}</span>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded text-white shadow-xs shrink-0"
                  style={{ background: bConfig.color }}
                >
                  {bConfig.label}
                </span>
              </div>

              {/* Foto real da infraestrutura portuária */}
              <div className="relative w-full h-36 bg-[#0f172a]/5 rounded-lg overflow-hidden border border-[#e2e8f0] mb-2 shadow-inner flex items-center justify-center">
                <img
                  src={bConfig.image}
                  alt={bConfig.label}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded font-mono font-medium">
                  Foto real
                </div>
              </div>

              {/* Métricas do alinhamento */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-2 bg-[#f8fafc] p-2 rounded-md border border-[#edf2f7]">
                <div>
                  <span className="text-[#64748b] block text-[10px] font-medium">Estação no cais</span>
                  <span className="font-mono font-bold text-[#0f172a]">{hoveredDisplay.position.toFixed(1).replace(".", ",")} m</span>
                </div>
                {distToNext !== null ? (
                  <div>
                    <span className="text-[#64748b] block text-[10px] font-medium">Distância próx. ({nextDisplay?.id})</span>
                    <span className="font-mono font-bold text-[#0f172a]">{distToNext.toFixed(1).replace(".", ",")} m</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[#64748b] block text-[10px] font-medium">Alinhamento</span>
                    <span className="font-bold text-[#0f172a] text-[11px]">Último cabeço</span>
                  </div>
                )}
              </div>

              {/* Estado de amarração */}
              {moored.length > 0 ? (
                <div className="text-[10px] text-[#0369a1] bg-[#e0f2fe] px-2 py-1 rounded font-semibold border border-[#bae6fd]">
                  ⚓ Amarrado: {moored.map((l) => `${l.vesselName} (${l.lineType})`).join(", ")}
                </div>
              ) : (
                <div className="text-[10px] text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded text-center">
                  Livre para amarração
                </div>
              )}

              <div className="text-[9.5px] text-[#94a3b8] text-center mt-1.5">
                Clique para editar número, tipo ou cota
              </div>

              {/* Triângulo / Seta apontando para o cabeço */}
              <div
                className="absolute -bottom-1.5 w-3 h-3 bg-white border-r border-b border-[#cbd5e1]"
                style={{
                  left: `calc(50% + ${Math.max(-cardWidth / 2 + 16, Math.min(cardWidth / 2 - 16, arrowOffset))}px)`,
                  transform: "translateX(-50%) rotate(45deg)",
                }}
              />
            </div>
          </div>
        );
      })()}
      </div>

      {editingBollardId && (
        <Dialog open={!!editingBollardId} onOpenChange={(open) => !open && setEditingBollardId(null)}>
          <DialogContent className="sm:max-w-md p-6 bg-white border border-[#d8e1e4] rounded-lg shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#102d40] flex items-center gap-2">
                <span>Editar Cabeço</span>
                <span
                  className="px-2 py-0.5 rounded text-white text-xs font-mono font-bold"
                  style={{ background: BOLLARD_TYPES[editType]?.color || "#3a7ebf" }}
                >
                  {editId || editingBollardId}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#71848c]">
                Configure o número, o tipo com sua cor oficial e a distância no cais.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = editId.trim();
                if (trimmed && editingBollardId) {
                  const pos = editPosition === "" ? null : Math.max(0, Number(editPosition));
                  onUpdateBollard?.(editingBollardId, {
                    id: trimmed,
                    type: editType,
                    position: pos,
                  });
                  setEditingBollardId(null);
                }
              }}
              className="space-y-4 pt-2"
            >
              <div>
                <label className="text-xs font-semibold text-[#507079] block mb-1">
                  Número / Identificação
                </label>
                <input
                  autoFocus
                  className="w-full h-9 px-3 border border-[#cfdadd] rounded-md text-sm font-bold text-[#102d40] focus:outline-none focus:border-[#16869a]"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  maxLength={12}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#507079] block mb-1.5">
                  Tipo de Cabeço (Modelo e cor oficial)
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {(Object.keys(BOLLARD_TYPES) as BollardType[]).map((typeKey) => {
                    const cfg = BOLLARD_TYPES[typeKey];
                    const isSelected = editType === typeKey;
                    return (
                      <button
                        key={typeKey}
                        type="button"
                        onClick={() => setEditType(typeKey)}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md border text-left text-xs font-semibold transition-all ${
                          isSelected
                            ? "border-[#16869a] bg-[#f0f8f8] text-[#102d40] ring-1 ring-[#16869a]"
                            : "border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]"
                        }`}
                      >
                        <img
                          src={cfg.image}
                          alt={cfg.label}
                          className="w-10 h-10 rounded object-cover border border-[#cbd5e1] shrink-0"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border shadow-xs"
                          style={{ background: cfg.color, borderColor: cfg.border }}
                        />
                        <span className="flex-1 font-medium">{cfg.label}</span>
                        {isSelected && <span className="text-[10px] text-[#16869a] font-bold">✓ Selecionado</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#507079] block mb-1">
                  Posição no cais (em metros desde o início)
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max={total}
                    className="w-full h-9 px-3 border border-[#cfdadd] rounded-l-md text-sm font-semibold text-[#102d40] focus:outline-none focus:border-[#16869a]"
                    placeholder="Sem posição (esquemático)"
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                  />
                  <span className="h-9 px-3 bg-[#f1f5f9] border border-l-0 border-[#cfdadd] rounded-r-md text-xs font-bold text-[#64748b] flex items-center">
                    m
                  </span>
                </div>
                <p className="text-[11px] text-[#85949a] mt-1">
                  Cais total: {total} m. O cabeço se posicionará na coordenada informada.
                </p>
              </div>

              {(() => {
                const currentIndex = editingBollardId ? scenario.bollards.findIndex((b) => b.id === editingBollardId) : -1;
                const prevBollard = currentIndex > 0 ? scenario.bollards[currentIndex - 1] : null;
                const nextBollard = currentIndex >= 0 && currentIndex < scenario.bollards.length - 1 ? scenario.bollards[currentIndex + 1] : null;
                const currentPos = editPosition === "" ? null : Number(editPosition);

                return (
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-md p-2.5 text-xs text-[#475569] space-y-1.5">
                    <div className="font-semibold text-[#1e293b]">Espaçamento com os cabeços adjacentes:</div>
                    {prevBollard && prevBollard.position !== null && currentPos !== null && (
                      <div className="flex justify-between items-center">
                        <span>Do cabeço anterior (<strong>{prevBollard.id}</strong>):</span>
                        <span className="font-mono font-bold text-[#0f172a] bg-white px-2 py-0.5 rounded border border-[#e2e8f0]">
                          {Math.abs(currentPos - prevBollard.position).toFixed(1).replace(".", ",")} m
                        </span>
                      </div>
                    )}
                    {nextBollard && nextBollard.position !== null && currentPos !== null && (
                      <div className="flex justify-between items-center">
                        <span>Para o próximo cabeço (<strong>{nextBollard.id}</strong>):</span>
                        <span className="font-mono font-bold text-[#0f172a] bg-white px-2 py-0.5 rounded border border-[#e2e8f0]">
                          {Math.abs(nextBollard.position - currentPos).toFixed(1).replace(".", ",")} m
                        </span>
                      </div>
                    )}
                    {!prevBollard && <div className="text-[11px] text-[#64748b]">Extremidade esquerda do alinhamento.</div>}
                    {!nextBollard && <div className="text-[11px] text-[#64748b]">Extremidade direita do alinhamento.</div>}
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#edf1f2]">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setEditingBollardId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={!editId.trim()}
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
