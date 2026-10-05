export type VesselColor = "blue" | "teal" | "orange" | "violet";
export type BerthingSide = "bombordo" | "boreste";
export type MooringLineType = "lancante-proa" | "spring-proa" | "spring-popa" | "lancante-popa";

export const MOORING_LINE_LABELS: Record<MooringLineType, string> = {
  "lancante-proa": "Lançante de proa",
  "spring-proa": "Spring de proa",
  "spring-popa": "Spring de popa",
  "lancante-popa": "Lançante de popa",
};

export interface BerthSegment {
  id: string;
  name: string;
  length: number;
}

export type BollardType = "duplo" | "alto-antigo" | "alto-novo" | "baixo-antigo" | "avariado";

export const BOLLARD_TYPES: Record<BollardType, { label: string; color: string; border: string; image: string }> = {
  "duplo": { label: "Cabeço duplo", color: "#3a7ebf", border: "#225a8d", image: "/bollards/cabeco-duplo.png" },
  "alto-antigo": { label: "Cabeço alto antigo", color: "#3d4529", border: "#252b17", image: "/bollards/cabeco-alto-antigo.jpg" },
  "alto-novo": { label: "Cabeço alto novo", color: "#6c757d", border: "#495057", image: "/bollards/cabeco-alto-novo.jpg" },
  "baixo-antigo": { label: "Cabeço baixo antigo", color: "#e67e22", border: "#b85d10", image: "/bollards/cabeco-baixo-antigo.png" },
  "avariado": { label: "Cabeço avariado", color: "#d62828", border: "#9e1515", image: "/bollards/cabeco-duplo.png" },
};

export interface Bollard {
  id: string;
  /** Metros desde o início do cais; null significa posição ainda não cadastrada. */
  position: number | null;
  type?: BollardType;
}

export interface MooringLine {
  id: string;
  type: MooringLineType;
  /** Ponto do navio medido desde a popa; null enquanto não informado. */
  shipOffset: number | null;
  bollardId: string | null;
}

export type VesselType =
  | "container"
  | "chemical-tanker"
  | "product-tanker"
  | "tanker"
  | "general-cargo"
  | "offshore"
  | "diving-support"
  | "research-survey";

export const VESSEL_TYPE_LABELS: Record<VesselType, string> = {
  "container": "Porta-Contêineres (Container Ship - Fully Cellular)",
  "chemical-tanker": "Navio Tanque Químico (Chemical Tanker)",
  "product-tanker": "Petroleiro de Produtos (Product Tanker)",
  "tanker": "Petroleiro / Químico (Tanker Geral)",
  "general-cargo": "Carga Geral / Graneleiro (General Cargo)",
  "offshore": "Apoio Marítimo (Platform Supply Ship / PSV / AHTS)",
  "diving-support": "Apoio a Mergulho / Subsea (Diving Support Vessel - DSV)",
  "research-survey": "Pesquisa / Hidrográfico (Research Survey Vessel)",
};

export const KNOWN_VESSEL_TYPES: Record<string, VesselType> = {
  "OCEAN MERMAID": "research-survey",
  "CMA CGM IRON": "container",
  "CMA CGM PUCCINI": "container",
  "COSCO SHIPPING ARGENTINA": "container",
  "COSCO SHIPPING BRAZIL": "container",
  "COSCO SHIPPING CHILE": "container",
  "EVER FAME": "container",
  "EVER FAR": "container",
  "EVER FASHION": "container",
  "EVER LEADER": "container",
  "KOTA PAHLAWAN": "container",
  "LOG-IN PANTANAL": "container",
  "LONCOMILLA": "container",
  "MALIAKOS": "container",
  "NC BRAVO": "container",
  "NC BREDA": "container",
  "TOKYO EXPRESS": "container",
  "ZIM BALTIMORE": "container",
};

export function normalizeVesselType(raw?: string | null, vesselName?: string | null): VesselType {
  const upper = (raw ?? "").toUpperCase().trim();
  const upperName = (vesselName ?? "").toUpperCase().trim();

  // 0. Reconhecimento direto pelo nome do navio no catálogo ou padrões de nomenclatura
  if (upperName && KNOWN_VESSEL_TYPES[upperName]) {
    return KNOWN_VESSEL_TYPES[upperName];
  }
  if (
    upperName.includes("OCEAN MERMAID") ||
    upperName.includes("SURVEY") ||
    upperName.includes("RESEARCH") ||
    upperName.includes("HIDROGRAF") ||
    upperName.includes("OCEANOGRAF")
  ) {
    return "research-survey";
  }

  // 1. Pesquisa / Survey (específico)
  if (
    upper.includes("RESEARCH") ||
    upper.includes("SURVEY") ||
    upper.includes("HIDROGRAF") ||
    upper.includes("PESQUISA") ||
    upper.includes("OCEANOGRAF")
  ) {
    return "research-survey";
  }

  // 2. Chemical Tanker (específico)
  if (
    upper.includes("CHEMICAL") ||
    upper.includes("QUÍMICO") ||
    upper.includes("QUIMICO") ||
    upperName.includes("CHEM") ||
    upperName.includes("STOLT") ||
    upperName.includes("ODFJELL")
  ) {
    return "chemical-tanker";
  }

  // 3. Product Tanker (específico)
  if (
    upper.includes("PRODUCT") ||
    upper.includes("PRODUTO") ||
    upper.includes("CLEAN")
  ) {
    return "product-tanker";
  }

  // 4. Tanker geral (petroleiro, óleo, gás)
  if (
    upper === "tanker" ||
    upper.includes("TANKER") ||
    upper.includes("OIL") ||
    upper.includes("PETROLEIRO") ||
    upper.includes("GAS") ||
    upper.includes("LPG") ||
    upper.includes("LNG") ||
    upper.includes("BITUMEN") ||
    upper.includes("ASPHALT") ||
    upperName.includes("TANKER") ||
    upperName.includes("PETRO")
  ) {
    return "tanker";
  }

  // 5. Apoio a Mergulho / DSV / Subsea
  if (
    upper.includes("DIVING") ||
    upper.includes("MERGULHO") ||
    upper.includes("DSV")
  ) {
    return "diving-support";
  }

  // 6. Apoio Offshore / PSV / Supply
  if (
    upper === "offshore" ||
    upper.includes("OFFSHORE") ||
    upper.includes("PLATFORM SUPPLY") ||
    upper.includes("PSV") ||
    upper.includes("AHTS") ||
    upper.includes("SUPPLY") ||
    upper.includes("TUG") ||
    upper.includes("REBOCADOR") ||
    upper.includes("OSRV") ||
    upper.includes("PLSV") ||
    upperName.includes("SUPPLY") ||
    upperName.includes("AHTS") ||
    upperName.includes("SKANDI") ||
    upperName.includes("SIEM") ||
    upperName.includes("NORMAND") ||
    upperName.includes("BOURBON")
  ) {
    return "offshore";
  }

  // 7. Carga Geral / Graneleiro
  if (
    upper === "general-cargo" ||
    upper.includes("GENERAL CARGO") ||
    upper.includes("CARGO SHIP") ||
    upper.includes("CARGA GERAL") ||
    upper.includes("BULK") ||
    upper.includes("GRANELEIRO") ||
    upper.includes("ORE CARRIER") ||
    upper.includes("CARRIER")
  ) {
    return "general-cargo";
  }

  if (upper === "container" || upper.includes("CONTAINER")) {
    return "container";
  }

  return "container";
}

export interface Vessel {
  id: string;
  name: string;
  loa: number;
  beam: number;
  draft: number;
  position: number;
  /** Lado do navio voltado para o cais; a vista superior espelha a proa conforme a escolha. */
  berthingSide: BerthingSide;
  /** Posição do eixo/ponto central da escada medida a partir da popa. */
  gangwayOffset: number;
  mooringLines: MooringLine[];
  color: VesselColor;
  vesselType?: VesselType;
}

export interface Portainer {
  id: string; // P4, P5, P6, P7, P8, P9
  name: string;
  position: number;
  color: string;
  badgeColor: string;
  enabled: boolean;
}

export const DEFAULT_PORTAINERS: Portainer[] = [
  { id: "P7", name: "P7", position: 175, color: "#65a30d", badgeColor: "#4d7c0f", enabled: true },
  { id: "P6", name: "P6", position: 215, color: "#2563eb", badgeColor: "#1d4ed8", enabled: true },
  { id: "P9", name: "P9", position: 255, color: "#be123c", badgeColor: "#9f1239", enabled: true },
  { id: "P8", name: "P8", position: 295, color: "#ea580c", badgeColor: "#c2410c", enabled: true },
  { id: "P5", name: "P5", position: 640, color: "#9333ea", badgeColor: "#7e22ce", enabled: true },
  { id: "P4", name: "P4", position: 695, color: "#78350f", badgeColor: "#58250b", enabled: true },
];

export interface PortainerLimit {
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

/** Retorna os limites operacionais de deslocamento dos portêineres (P5 não passa de 297-296; P6 não passa de 291-290). */
export function getPortainerOperationalLimits(bollards: Bollard[]): Record<string, PortainerLimit> {
  const b297 = bollards.find((b) => b.id === "297")?.position ?? 276.9;
  const b296 = bollards.find((b) => b.id === "296")?.position ?? 306.9;
  const p5Min = Number(((b297 + b296) / 2).toFixed(1)); // Ponto médio entre 297 e 296

  const b291 = bollards.find((b) => b.id === "291")?.position ?? 443.9;
  const b290 = bollards.find((b) => b.id === "290")?.position ?? 473.9;
  const p6Max = Number(((b291 + b290) / 2).toFixed(1)); // Ponto médio entre 291 e 290

  return {
    P5: {
      min: p5Min,
      minLabel: `Cabeços 297–296 (${p5Min.toFixed(1).replace(".", ",")} m)`,
    },
    P6: {
      max: p6Max,
      maxLabel: `Cabeços 291–290 (${p6Max.toFixed(1).replace(".", ",")} m)`,
    },
  };
}

/** Aplica a trava de limite do portêiner: se tentar passar do cabeço 297-296 (P5) ou 291-290 (P6), trava e retorna o aviso. */
export function clampPortainerPosition(
  id: string,
  rawPosition: number,
  bollards: Bollard[],
  totalQuay: number
): { position: number; hitLimit: boolean; message?: string } {
  const limits = getPortainerOperationalLimits(bollards)[id];
  let position = Math.max(0, Math.min(totalQuay, rawPosition));
  let hitLimit = false;
  let message: string | undefined;

  if (limits?.min !== undefined && position < limits.min) {
    position = limits.min;
    hitLimit = true;
    message = `Limite do Portêiner ${id}: o ${id} não pode passar do ponto médio entre os cabeços 297 e 296 (estação ${limits.min.toFixed(1).replace(".", ",")} m).`;
  } else if (limits?.max !== undefined && position > limits.max) {
    position = limits.max;
    hitLimit = true;
    message = `Limite do Portêiner ${id}: o ${id} não pode passar do ponto médio entre os cabeços 291 e 290 (estação ${limits.max.toFixed(1).replace(".", ",")} m).`;
  }

  return { position: Number(position.toFixed(1)), hitLimit, message };
}

export interface Scenario {
  name: string;
  clearance: number;
  segments: BerthSegment[];
  vessels: Vessel[];
  bollards: Bollard[];
  portainers?: Portainer[];
  showPortainers?: boolean;
}

export interface BerthIssue {
  vesselId: string;
  kind: "edge" | "spacing" | "overlap";
  message: string;
}

export const STORAGE_KEY = "caislab:scenario:v5";

export const VESSEL_COLORS: Record<VesselColor, { label: string; fill: string; stroke: string; accent: string }> = {
  blue: { label: "Azul", fill: "#3f779b", stroke: "#285a78", accent: "#b9dce9" },
  teal: { label: "Petróleo", fill: "#2f8b89", stroke: "#216c6b", accent: "#b8e5dc" },
  orange: { label: "Âmbar", fill: "#d17a3d", stroke: "#a85a2b", accent: "#f3d2b5" },
  violet: { label: "Violeta", fill: "#7769a5", stroke: "#594e83", accent: "#d5ceed" },
};

export const CONTAINER_COLORS = ["#d8e7e7", "#bdd8dd", "#e5c5a4", "#b7c7d0", "#c8d1ae", "#f0dfb5"];

const MOORING_TYPES = Object.keys(MOORING_LINE_LABELS) as MooringLineType[];

export function defaultMooringOffset(type: MooringLineType, loa: number) {
  return loa * (type.endsWith("proa") ? 0.9 : 0.1);
}

export function mooringOffsetLimits(type: MooringLineType, loa: number) {
  return type.endsWith("proa")
    ? { min: loa * 0.7, max: loa }
    : { min: 0, max: loa * 0.3 };
}

/** Keeps bow cables in the forward third and stern cables in the aft third. */
export function normalizeMooringOffset(type: MooringLineType, loa: number, offset: number | null) {
  const limits = mooringOffsetLimits(type, loa);
  if (offset === null || !Number.isFinite(offset) || offset < limits.min || offset > limits.max) {
    return defaultMooringOffset(type, loa);
  }
  return offset;
}

/** Position from the left endpoint of the berth view, given a station from the stern. */
export function berthwiseOffsetFromStern(loa: number, side: BerthingSide, offsetFromStern: number) {
  return side === "bombordo" ? loa - offsetFromStern : offsetFromStern;
}

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

export const DEFAULT_BOLLARD_CONFIG: { id: string; distanceToNext: number; type: BollardType }[] = [
  { id: "309", distanceToNext: 19.8, type: "duplo" },
  { id: "308", distanceToNext: 19.8, type: "duplo" },
  { id: "307", distanceToNext: 19.8, type: "duplo" },
  { id: "306", distanceToNext: 19.8, type: "duplo" },
  { id: "305", distanceToNext: 10.7, type: "duplo" },
  { id: "304", distanceToNext: 25.0, type: "duplo" },
  { id: "303", distanceToNext: 25.0, type: "duplo" },
  { id: "302", distanceToNext: 25.0, type: "duplo" },
  { id: "301", distanceToNext: 25.0, type: "duplo" },
  { id: "300", distanceToNext: 25.0, type: "duplo" },
  { id: "299", distanceToNext: 25.0, type: "duplo" },
  { id: "298", distanceToNext: 25.0, type: "duplo" },
  { id: "297", distanceToNext: 30.0, type: "duplo" },
  { id: "296", distanceToNext: 26.0, type: "alto-novo" },
  { id: "295", distanceToNext: 30.0, type: "alto-novo" },
  { id: "294", distanceToNext: 26.0, type: "alto-novo" },
  { id: "293", distanceToNext: 30.0, type: "alto-novo" },
  { id: "292", distanceToNext: 25.0, type: "alto-novo" },
  { id: "291", distanceToNext: 30.0, type: "alto-novo" },
  { id: "290", distanceToNext: 26.0, type: "alto-novo" },
  { id: "289", distanceToNext: 30.0, type: "baixo-antigo" },
  { id: "288", distanceToNext: 38.0, type: "baixo-antigo" },
  { id: "287", distanceToNext: 25.5, type: "baixo-antigo" },
  { id: "286", distanceToNext: 25.0, type: "baixo-antigo" },
  { id: "285", distanceToNext: 26.0, type: "baixo-antigo" },
  { id: "284", distanceToNext: 25.0, type: "baixo-antigo" },
  { id: "283", distanceToNext: 25.0, type: "baixo-antigo" },
  { id: "282", distanceToNext: 26.0, type: "alto-novo" },
  { id: "281", distanceToNext: 25.5, type: "alto-novo" },
  { id: "280", distanceToNext: 25.5, type: "alto-novo" },
  { id: "279", distanceToNext: 25.5, type: "alto-novo" },
  { id: "278", distanceToNext: 26.5, type: "baixo-antigo" },
  { id: "277", distanceToNext: 0, type: "alto-antigo" },
];

export function createBollardInventory(): Bollard[] {
  let currentPos = 12.0;
  return DEFAULT_BOLLARD_CONFIG.map((item) => {
    const bollard: Bollard = {
      id: item.id,
      position: Number(currentPos.toFixed(1)),
      type: item.type,
    };
    currentPos += item.distanceToNext;
    return bollard;
  });
}

export interface BollardDisplayPosition {
  id: string;
  position: number;
  estimated: boolean;
  type?: BollardType;
}

/** Unpositioned bollards get schematic display slots only; their saved position remains null. */
export function bollardDisplayPositions(bollards: Bollard[], quayLength: number): BollardDisplayPosition[] {
  if (!Number.isFinite(quayLength) || quayLength <= 0) return [];
  const lastIndex = Math.max(1, bollards.length - 1);
  const positions: BollardDisplayPosition[] = [];
  bollards.forEach((bollard, index) => {
    if (bollard.position !== null) {
      if (bollard.position <= quayLength) positions.push({ id: bollard.id, position: bollard.position, estimated: false, type: bollard.type });
      return;
    }
    positions.push({
      id: bollard.id,
      position: bollards.length <= 1 ? quayLength / 2 : (index / lastIndex) * quayLength,
      estimated: true,
      type: bollard.type,
    });
  });
  return positions;
}

function splitDelimitedRow(row: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && quoted && row[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function serializeBollardCsv(bollards: Bollard[]) {
  const quote = (value: string) => /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const rows = ["identificador;posicao_m", ...bollards.map((bollard) => `${quote(bollard.id)};${bollard.position === null ? "" : bollard.position.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 1 })}`)];
  return `\uFEFF${rows.join("\r\n")}`;
}

export function parseBollardCsv(content: string, quayLength: number): Bollard[] {
  const rows = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  const delimiter = rows[0].includes(";") ? ";" : rows[0].includes("\t") ? "\t" : ",";
  const updates: Bollard[] = [];
  for (const [index, row] of rows.entries()) {
    const [id = "", rawPosition = ""] = splitDelimitedRow(row, delimiter);
    if (index === 0 && /identificador|cabe[cç]o|^id$/i.test(id) && /posi[cç]|metro|station/i.test(rawPosition)) continue;
    if (!rawPosition) continue;
    if (!id) throw new Error(`Linha ${index + 1}: informe o identificador do cabeço.`);
    const position = Number(rawPosition.replace(",", "."));
    if (!Number.isFinite(position) || position < 0 || position > quayLength) {
      const max = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(quayLength);
      throw new Error(`Linha ${index + 1}: a posição precisa estar entre 0 e ${max} m.`);
    }
    updates.push({ id, position });
  }
  if (new Set(updates.map((item) => item.id)).size !== updates.length) throw new Error("O CSV contém identificadores de cabeço repetidos.");
  return updates;
}

export function createDemoScenario(): Scenario {
  return {
    name: "Plano de atracação",
    clearance: 15,
    segments: [
      { id: "segment-expansao", name: "Expansão", length: 85 },
      { id: "segment-prolongamento", name: "Prolongamento", length: 430 },
      { id: "segment-tecon", name: "Tecon 1", length: 385 },
    ],
    vessels: [],
    bollards: createBollardInventory(),
    portainers: DEFAULT_PORTAINERS.map((p) => ({ ...p })),
    showPortainers: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMooringLineType(value: unknown): value is MooringLineType {
  return typeof value === "string" && MOORING_TYPES.includes(value as MooringLineType);
}

/** Normaliza cenários novos e versões antigas, que não tinham cabeços nem escada. */
export function normalizeScenario(value: unknown): Scenario | null {
  if (!isRecord(value) || typeof value.name !== "string" || !Array.isArray(value.segments) || !Array.isArray(value.vessels)) return null;
  if (typeof value.clearance !== "number" || !Number.isFinite(value.clearance)) return null;

  const segments: BerthSegment[] = [];
  for (const [index, raw] of value.segments.entries()) {
    if (!isRecord(raw) || typeof raw.name !== "string" || typeof raw.length !== "number" || !Number.isFinite(raw.length)) return null;
    segments.push({ id: typeof raw.id === "string" && raw.id ? raw.id : makeId("trecho"), name: raw.name, length: Math.max(1, raw.length) });
  }

  const vessels: Vessel[] = [];
  for (const [index, raw] of value.vessels.entries()) {
    if (!isRecord(raw) || typeof raw.name !== "string" || typeof raw.loa !== "number" || !Number.isFinite(raw.loa) || typeof raw.position !== "number" || !Number.isFinite(raw.position)) return null;
    const loa = Math.max(1, raw.loa);
    const rawLines = Array.isArray(raw.mooringLines) ? raw.mooringLines : [];
    const mooringLines: MooringLine[] = rawLines.flatMap((candidate, lineIndex) => {
      if (!isRecord(candidate) || !isMooringLineType(candidate.type)) return [];
      const shipOffset = normalizeMooringOffset(
        candidate.type,
        loa,
        typeof candidate.shipOffset === "number" && Number.isFinite(candidate.shipOffset) ? candidate.shipOffset : null,
      );
      return [{
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : makeId(`cabo-${lineIndex}`),
        type: candidate.type,
        shipOffset,
        bollardId: typeof candidate.bollardId === "string" ? candidate.bollardId : null,
      }];
    });
    const color = typeof raw.color === "string" && Object.prototype.hasOwnProperty.call(VESSEL_COLORS, raw.color)
      ? raw.color as VesselColor
      : (["blue", "teal", "orange", "violet"] as VesselColor[])[index % 4];
    const gangway = typeof raw.gangwayOffset === "number" && Number.isFinite(raw.gangwayOffset) ? raw.gangwayOffset : loa / 2;
    const vesselType = normalizeVesselType(
      typeof raw.vesselType === "string" ? raw.vesselType : typeof raw.type === "string" ? raw.type : undefined,
      raw.name,
    );
    vessels.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId("navio"),
      name: raw.name,
      loa,
      beam: typeof raw.beam === "number" && Number.isFinite(raw.beam) ? Math.max(0, raw.beam) : 0,
      draft: typeof raw.draft === "number" && Number.isFinite(raw.draft) ? Math.max(0, raw.draft) : 0,
      position: raw.position,
      berthingSide: raw.berthingSide === "bombordo" || raw.berthingSide === "boreste" ? raw.berthingSide : "boreste",
      gangwayOffset: Math.min(loa, Math.max(0, gangway)),
      mooringLines,
      color,
      vesselType,
    });
  }

    const has309 = Array.isArray(value.bollards) &&
      value.bollards.some((b: unknown) => isRecord(b) && b.id === "309");
    const has277 = Array.isArray(value.bollards) &&
      value.bollards.some((b: unknown) => isRecord(b) && b.id === "277");

    let bollards: Bollard[];
    if (!has309 || !has277) {
      bollards = createBollardInventory();
    } else {
      bollards = (value.bollards as unknown[]).flatMap((raw) => {
        if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return [];
        const position = typeof raw.position === "number" && Number.isFinite(raw.position) && raw.position >= 0 ? raw.position : null;
        const type = (typeof raw.type === "string" && Object.prototype.hasOwnProperty.call(BOLLARD_TYPES, raw.type))
          ? (raw.type as BollardType)
          : undefined;
        return [{ id: raw.id, position, type }];
      });
    }

    // Normalizar Portêineres (P4, P5, P6, P7, P8, P9)
    const showPortainers = typeof value.showPortainers === "boolean" ? value.showPortainers : true;
    let portainers: Portainer[] = [];
    if (Array.isArray(value.portainers) && value.portainers.length > 0) {
      portainers = (value.portainers as unknown[]).flatMap((raw) => {
        if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return [];
        const def = DEFAULT_PORTAINERS.find((p) => p.id === raw.id);
        const pos = typeof raw.position === "number" && Number.isFinite(raw.position) ? Math.max(0, raw.position) : (def?.position ?? 150);
        return [{
          id: raw.id,
          name: typeof raw.name === "string" ? raw.name : raw.id,
          position: pos,
          color: typeof raw.color === "string" ? raw.color : (def?.color ?? "#2563eb"),
          badgeColor: typeof raw.badgeColor === "string" ? raw.badgeColor : (def?.badgeColor ?? "#1d4ed8"),
          enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
        }];
      });
      DEFAULT_PORTAINERS.forEach((def) => {
        if (!portainers.some((p) => p.id === def.id)) {
          portainers.push({ ...def });
        }
      });
    } else {
      portainers = DEFAULT_PORTAINERS.map((p) => ({ ...p }));
    }

  return {
    name: value.name,
    clearance: Math.max(0, value.clearance),
    segments,
    vessels,
    bollards,
    portainers,
    showPortainers,
  };
}

export function readScenario(): Scenario {
  if (typeof window === "undefined") return createDemoScenario();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoScenario();
    const scenario = normalizeScenario(JSON.parse(raw));
    if (!scenario) return createDemoScenario();
    // Ensure bollards match the 33 bollards with exact measurements and types from the port plan
    const b277 = scenario.bollards.find((b) => b.id === "277");
    const b288 = scenario.bollards.find((b) => b.id === "288");
    const b289 = scenario.bollards.find((b) => b.id === "289");
    if (!b277 || !b288 || !b289 || b289.type !== "baixo-antigo" || b277.type !== "alto-antigo" || Math.abs((b277.position ?? 0) - 823.4) > 1.0) {
      scenario.bollards = createBollardInventory();
    }
    return scenario;
  } catch {
    return createDemoScenario();
  }
}

export function totalQuayLength(segments: BerthSegment[]) {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.length || 0), 0);
}

export function totalShipLength(vessels: Vessel[]) {
  return vessels.reduce((sum, vessel) => sum + Math.max(0, vessel.loa || 0), 0);
}

export function minimumRequiredLength(vessels: Vessel[], clearance: number) {
  if (!vessels.length) return 0;
  return totalShipLength(vessels) + Math.max(0, clearance) * (vessels.length + 1);
}

export function remainingLength(segments: BerthSegment[], vessels: Vessel[], clearance: number) {
  return totalQuayLength(segments) - minimumRequiredLength(vessels, clearance);
}

export function calculateIssues(scenario: Scenario): BerthIssue[] {
  const total = totalQuayLength(scenario.segments);
  const margin = Math.max(0, scenario.clearance);
  const issues: BerthIssue[] = [];
  const ordered = [...scenario.vessels].sort((a, b) => a.position - b.position);

  for (const vessel of ordered) {
    if (vessel.position < margin) {
      issues.push({ vesselId: vessel.id, kind: "edge", message: `Menos de ${margin} m de margem no início do cais` });
    }
    if (vessel.position + vessel.loa > total - margin) {
      issues.push({ vesselId: vessel.id, kind: "edge", message: `Menos de ${margin} m de margem no final do cais` });
    }
  }

  for (let firstIndex = 0; firstIndex < ordered.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
      const previous = ordered[firstIndex];
      const current = ordered[secondIndex];
      const gap = current.position - (previous.position + previous.loa);
      if (gap < 0) {
        issues.push({ vesselId: current.id, kind: "overlap", message: `Sobreposição de ${Math.abs(gap).toFixed(0)} m com ${previous.name}` });
        issues.push({ vesselId: previous.id, kind: "overlap", message: `Sobreposição de ${Math.abs(gap).toFixed(0)} m com ${current.name}` });
      } else if (secondIndex === firstIndex + 1 && gap < margin) {
        issues.push({
          vesselId: current.id,
          kind: "spacing",
          message: `Afastamento de ${gap.toFixed(0)} m para ${previous.name}; mínimo configurado: ${margin} m`,
        });
      }
    }
  }
  return issues;
}

export function segmentOffsets(segments: BerthSegment[]) {
  let current = 0;
  return segments.map((segment) => {
    const item = { ...segment, start: current, end: current + Math.max(0, segment.length) };
    current = item.end;
    return item;
  });
}

export function vesselSectionName(vessel: Vessel, segments: BerthSegment[]) {
  const starts = segmentOffsets(segments);
  const endPosition = vessel.position + vessel.loa;
  const match = starts.find((segment) => vessel.position >= segment.start && endPosition <= segment.end);
  if (match) return match.name;
  const touched = starts.filter((segment) => vessel.position < segment.end && endPosition > segment.start);
  return touched.length > 1 ? "Cruza trechos" : touched[0]?.name ?? "Fora do cais";
}
