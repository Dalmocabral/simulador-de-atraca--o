import { useEffect, useRef, useState } from "react";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Scenario, Vessel } from "@/lib/berth-model";
import {
  BOLLARD_TYPES,
  DEFAULT_PORTAINERS,
  bayNumberSequence,
  berthwiseOffsetFromStern,
  bollardDisplayPositions,
  defaultMooringOffset,
  MOORING_LINE_LABELS,
  normalizeMooringOffset,
  normalizeBayCount,
  normalizeVesselType,
  segmentOffsets,
  totalQuayLength,
  VESSEL_COLORS,
} from "@/lib/berth-model";

interface Berth3DViewerProps {
  scenario: Scenario;
}

type ThreeModule = typeof import("three");
type ThreeObject = import("three").Object3D;

const CONTAINER_COLORS_3D = [
  "#e24b3b", "#f08222", "#e5ba18", "#2386c8", "#35965b",
  "#815bb8", "#d5476c", "#17a0a0", "#596c7e",
] as const;
const HULL_STATIONS = [
  [0, 0.72], [0.025, 0.83], [0.08, 0.94], [0.16, 0.98], [0.82, 0.98],
  [0.9, 0.93], [0.95, 0.72], [0.98, 0.4], [1, 0.08],
] as const;
const BERTH_GAP = 4;
const QUAY_EDGE_Z = 0;
const QUAY_TOP_Y = 4;

function stationToX(station: number, total: number): number {
  return total / 2 - station;
}

function addBox(
  THREE: ThreeModule,
  parent: ThreeObject,
  size: [number, number, number],
  position: [number, number, number],
  material: import("three").Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function createHullGeometry(
  THREE: ThreeModule,
  direction: number,
  loa: number,
  beam: number,
  draft: number,
  freeboard: number,
) {
  const crossSection: [number, number][] = [
    [-draft, 0], [-draft * 0.72, -0.48], [0, -0.86], [freeboard * 0.94, -1],
    [freeboard, -0.94], [freeboard, 0.94], [freeboard * 0.94, 1], [0, 0.86], [-draft * 0.72, 0.48],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [fraction, fullness] of HULL_STATIONS) {
    const x = direction * (fraction * loa - loa / 2);
    const halfWidth = (beam * fullness) / 2;
    for (const [y, sideFactor] of crossSection) positions.push(x, y, halfWidth * sideFactor);
  }

  const ringSize = crossSection.length;
  for (let station = 0; station < HULL_STATIONS.length - 1; station += 1) {
    for (let side = 0; side < ringSize; side += 1) {
      const nextSide = (side + 1) % ringSize;
      const a = station * ringSize + side;
      const b = station * ringSize + nextSide;
      const c = (station + 1) * ringSize + side;
      const d = (station + 1) * ringSize + nextSide;
      indices.push(a, b, c, b, d, c);
    }
  }

  const sternCenter = positions.length / 3;
  positions.push(direction * -loa / 2, (freeboard - draft) / 2, 0);
  const bowCenter = positions.length / 3;
  positions.push(direction * loa / 2, (freeboard - draft) / 2, 0);
  const lastStation = (HULL_STATIONS.length - 1) * ringSize;
  for (let side = 0; side < ringSize; side += 1) {
    const nextSide = (side + 1) % ringSize;
    indices.push(sternCenter, nextSide, side);
    indices.push(bowCenter, lastStation + side, lastStation + nextSide);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckGeometry(THREE: ThreeModule, direction: number, loa: number, beam: number) {
  const shape = new THREE.Shape();
  shape.moveTo(direction * -loa / 2, 0);
  for (const [fraction, fullness] of HULL_STATIONS.slice(1)) {
    shape.lineTo(direction * (fraction * loa - loa / 2), (beam * fullness) / 2);
  }
  for (const [fraction, fullness] of [...HULL_STATIONS].reverse()) {
    shape.lineTo(direction * (fraction * loa - loa / 2), -(beam * fullness) / 2);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function addVesselNameplate(
  THREE: ThreeModule,
  group: ThreeObject,
  vessel: Vessel,
  loa: number,
  beam: number,
  freeboard: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) return;
  const text = /cosco/i.test(vessel.name) ? "COSCO SHIPPING" : vessel.name.toUpperCase();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${text.length > 18 ? 68 : 92}px Arial, sans-serif`;
  context.lineWidth = 8;
  context.strokeStyle = "rgba(7, 31, 55, 0.7)";
  context.strokeText(text, canvas.width / 2, canvas.height / 2, canvas.width - 36);
  context.fillStyle = "#ffffff";
  context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  const materialSea = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide, depthWrite: false });
  const labelSea = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(loa * 0.48, 190), 3.4), materialSea);
  labelSea.position.set(0, freeboard * 0.46, beam * 0.5 + 0.1);
  group.add(labelSea);

  const materialQuay = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide, depthWrite: false });
  const labelQuay = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(loa * 0.48, 190), 3.4), materialQuay);
  labelQuay.rotation.y = Math.PI;
  labelQuay.position.set(0, freeboard * 0.46, -(beam * 0.5 + 0.1));
  group.add(labelQuay);
}

function addVessel(THREE: ThreeModule, scene: import("three").Scene, vessel: Vessel, total: number) {
  const direction = vessel.berthingSide === "boreste" ? -1 : 1;
  const loa = Math.max(1, vessel.loa);
  const beam = Math.max(1, vessel.beam);
  const draft = Number.isFinite(vessel.draft) ? Math.max(1, Math.min(18, vessel.draft)) : 10;
  // Altura do convés / borda livre aumentada para escala imponente e realista (11.2m a 15.5m)
  const deckHeight = Math.max(11.2, Math.min(15.5, (draft || 11) * 0.95));
  const shipCenterX = stationToX(vessel.position + loa / 2, total);
  const shipCenterZ = BERTH_GAP + beam / 2;
  const group = new THREE.Group();
  group.position.set(shipCenterX, 0, shipCenterZ);
  group.userData.vesselName = vessel.name;
  scene.add(group);

  const vType = normalizeVesselType(vessel.vesselType, vessel.name);
  const isTanker = vType === "chemical-tanker" || vType === "product-tanker" || vType === "tanker";
  const isContainer = vType === "container";
  const isOffshore = vType === "offshore" || vType === "diving-support";
  const isDiving = vType === "diving-support";
  const isResearch = vType === "research-survey";

  // Cor do casco:
  // - Tanker: azul-claro marítimo da foto de referência (#5da8bc)
  // - Offshore / Diving: vermelho vibrante (#dc2626) como DOF ou azul marítimo (#0284c7) como MMC/PSV
  // - Research / Survey (ex: OCEAN MERMAID): azul marinho oceanográfico (#1e40af)
  // - Container / Outros: conforme paleta selecionada
  const hullColor = isTanker
    ? "#5da8bc"
    : isOffshore
    ? (vessel.color === "orange" ? "#dc2626" : vessel.color === "teal" ? "#0f766e" : "#0284c7")
    : isResearch
    ? "#1e40af"
    : (VESSEL_COLORS[vessel.color]?.stroke ?? "#285a78");

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.58,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
  const hull = new THREE.Mesh(createHullGeometry(THREE, direction, loa, beam, draft, deckHeight), hullMaterial);
  group.add(hull);

  // Fundo submerso vermelho antifouling para embarcações offshore e de pesquisa
  if (isOffshore || isResearch) {
    addBox(THREE, group, [loa * 0.86, draft * 0.85, beam * 0.88], [0, -draft * 0.55, 0], new THREE.MeshStandardMaterial({ color: "#7f1d1d", roughness: 0.8 }));

    if (isOffshore) {
      // Propulsores Azimutais duplos na popa (Azimuth Thruster Pods com hélices em bronze)
      const thrusterX = -direction * (loa * 0.43);
      [-beam * 0.22, beam * 0.22].forEach((tz) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, draft * 0.55, 8), new THREE.MeshStandardMaterial({ color: "#1e293b" }));
        leg.position.set(thrusterX, -draft * 0.65, tz);
        group.add(leg);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#7f1d1d", side: THREE.DoubleSide }));
        nozzle.rotation.z = Math.PI / 2;
        nozzle.position.set(thrusterX, -draft * 0.88, tz);
        group.add(nozzle);
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: "#ca8a04", metalness: 0.8, roughness: 0.3 }));
        hub.position.set(thrusterX, -draft * 0.88, tz);
        group.add(hub);
      });
    }
  }

  const deckColor = isTanker ? "#94a3b8" : isOffshore ? "#9a5b32" : isResearch ? "#334155" : "#314957";
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: deckColor,
    roughness: 0.86,
    side: THREE.DoubleSide,
  });
  const deck = new THREE.Mesh(createDeckGeometry(THREE, direction, loa, beam), deckMaterial);
  deck.position.y = deckHeight - 0.37;
  group.add(deck);

  const darkDetailMaterial = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.7 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: "#0f2331", roughness: 0.25, metalness: 0.5 });

  if (isOffshore) {
    // =========================================================================
    // ⚓ MODELO OFFSHORE / SUPPLY SHIP / DIVING SUPPORT (DOF, MMC, PSV)
    // =========================================================================
    const fwdHouseX = direction * (loa * 0.24);
    const houseLen = Math.max(14, Math.min(loa * 0.30, 36));
    const houseH = 12.8;
    const houseMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.6 });
    const woodDeckMat = new THREE.MeshStandardMaterial({ color: "#a06034", roughness: 0.85 });
    const safetyYellowMat = new THREE.MeshStandardMaterial({ color: "#eab308", roughness: 0.4 });
    const orangeLifeboatMat = new THREE.MeshStandardMaterial({ color: "#ea580c", roughness: 0.35 });
    const subseaBlueMat = new THREE.MeshStandardMaterial({ color: "#1e3a8a", roughness: 0.5, metalness: 0.3 });

    // 1. Bloco de Acomodações de Proa
    addBox(THREE, group, [houseLen, houseH, beam * 0.82], [fwdHouseX, deckHeight + houseH / 2, 0], houseMat);

    // Decks e vigias intermediárias
    for (let f = 1; f < 4; f += 1) {
      const fY = deckHeight + f * 3.1;
      addBox(THREE, group, [houseLen * 1.02, 0.22, beam * 0.84], [fwdHouseX, fY, 0], darkDetailMaterial);
      addBox(THREE, group, [0.1, 0.45, beam * 0.58], [fwdHouseX + direction * (houseLen * 0.51), fY + 1.2, 0], windowMaterial);
    }

    // 2. Nichos embutidos para Baleeiras Fechadas (como nas fotos DOF e MMC)
    [-beam * 0.43, beam * 0.43].forEach((lz) => {
      addBox(THREE, group, [7.2, 2.4, 2.5], [fwdHouseX, deckHeight + 4.5, lz], orangeLifeboatMat);
      for (const lx of [-2.6, 2.6]) {
        addBox(THREE, group, [0.35, 3.2, 0.45], [fwdHouseX + lx, deckHeight + 5.1, lz + (lz > 0 ? -0.85 : 0.85)], darkDetailMaterial);
      }
    });

    // 3. Passadiço Panorâmico 360° (Wheelhouse com posto DP na ré e navegação na proa)
    const bridgeY = deckHeight + houseH;
    const bridgeH = 3.9;
    const bridgeLen = houseLen * 0.72;
    const bridgeW = Math.max(beam * 0.94, beam + 0.4);
    addBox(THREE, group, [bridgeLen, bridgeH, bridgeW], [fwdHouseX, bridgeY + bridgeH / 2, 0], houseMat);

    // Janelas de navegação voltadas para a PROA (+direction)
    addBox(THREE, group, [0.25, 1.45, bridgeW * 0.92], [fwdHouseX + direction * (bridgeLen * 0.5 + 0.05), bridgeY + bridgeH * 0.58, 0], windowMaterial);
    // Janelas de comando DP voltadas para o CONVÉS DE RÉ (-direction)
    addBox(THREE, group, [0.25, 1.45, bridgeW * 0.92], [fwdHouseX - direction * (bridgeLen * 0.5 + 0.05), bridgeY + bridgeH * 0.58, 0], windowMaterial);
    // Janelas laterais
    [-bridgeW * 0.49, bridgeW * 0.49].forEach((wz) => {
      addBox(THREE, group, [bridgeLen * 0.8, 1.3, 0.2], [fwdHouseX, bridgeY + bridgeH * 0.58, wz], windowMaterial);
    });

    // 4. Teto do Passadiço (Monkey Island)
    const roofY = bridgeY + bridgeH;
    addBox(THREE, group, [bridgeLen * 1.04, 0.35, bridgeW * 1.02], [fwdHouseX, roofY + 0.18, 0], houseMat);

    // Mastro de radares & sensores DP
    const radarTower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7.5, 8), darkDetailMaterial);
    radarTower.position.set(fwdHouseX, roofY + 4.0, 0);
    group.add(radarTower);
    addBox(THREE, group, [0.4, 0.35, 5.0], [fwdHouseX, roofY + 5.8, 0], darkDetailMaterial);
    addBox(THREE, group, [0.35, 0.32, 4.2], [fwdHouseX, roofY + 7.5, 0], new THREE.MeshStandardMaterial({ color: "#ffffff" }));

    // Cúpulas Satcom esféricas brancas
    [-beam * 0.25, beam * 0.25].forEach((dz) => {
      const satcom = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 12), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }));
      satcom.position.set(fwdHouseX - direction * (bridgeLen * 0.2), roofY + 1.4, dz);
      group.add(satcom);
    });

    // Canhões de combate a incêndio FiFi (vermelhos)
    [-beam * 0.16, beam * 0.16].forEach((fz) => {
      const fifi = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8), new THREE.MeshStandardMaterial({ color: "#dc2626" }));
      fifi.position.set(fwdHouseX + direction * (bridgeLen * 0.32), roofY + 0.9, fz);
      group.add(fifi);
    });

    // Chaminés gêmeas compactas nas bordas de ré da casaria
    [-beam * 0.32, beam * 0.32].forEach((cz) => {
      addBox(THREE, group, [2.8, 8.5, 1.8], [fwdHouseX - direction * (houseLen * 0.44), deckHeight + 4.25, cz], houseMat);
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 8), darkDetailMaterial);
      exhaust.position.set(fwdHouseX - direction * (houseLen * 0.44), deckHeight + 9.4, cz);
      group.add(exhaust);
    });

    // 5. Hangar / Mezanino Coberto na face de ré da casaria
    const hangarX = fwdHouseX - direction * (houseLen * 0.5 + 2.5);
    addBox(THREE, group, [5.0, 5.2, beam * 0.72], [hangarX, deckHeight + 2.6, 0], new THREE.MeshStandardMaterial({ color: "#e2e8f0" }));
    const winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, beam * 0.4, 12), new THREE.MeshStandardMaterial({ color: "#334155" }));
    winchDrum.rotation.z = Math.PI / 2;
    winchDrum.position.set(hangarX, deckHeight + 2.2, 0);
    group.add(winchDrum);

    // 6. Enorme Convés Aberto de Carga na Popa (Aft Cargo Deck em Madeira)
    const aftDeckStart = fwdHouseX - direction * (houseLen * 0.5 + 5.0);
    const aftDeckEnd = -direction * (loa * 0.47);
    const aftDeckLen = Math.abs(aftDeckEnd - aftDeckStart);
    const aftDeckCenterX = (aftDeckStart + aftDeckEnd) / 2;

    addBox(THREE, group, [aftDeckLen, 0.38, beam * 0.86], [aftDeckCenterX, deckHeight + 0.19, 0], woodDeckMat);

    // Trilhos de peação de carga em aço
    for (let track = -2; track <= 2; track += 1) {
      addBox(THREE, group, [aftDeckLen * 0.98, 0.08, 0.18], [aftDeckCenterX, deckHeight + 0.42, track * (beam * 0.16)], darkDetailMaterial);
    }

    // 7. Amuradas Laterais Robustas (Crash Rails) com corrimão amarelo e aberturas diagonais
    const railHeight = 2.8;
    for (const side of [-1, 1]) {
      const railZ = side * (beam * 0.44);
      addBox(THREE, group, [aftDeckLen, railHeight, 0.32], [aftDeckCenterX, deckHeight + railHeight / 2, railZ], hullMaterial);
      addBox(THREE, group, [aftDeckLen, 0.22, 0.36], [aftDeckCenterX, deckHeight + railHeight + 0.11, railZ], safetyYellowMat);

      // Marcações e aberturas diagonais de alívio (Freeing Ports)
      const slotCount = Math.max(4, Math.min(8, Math.floor(aftDeckLen / 9)));
      for (let s = 0; s < slotCount; s += 1) {
        const sx = aftDeckStart + (aftDeckEnd - aftDeckStart) * ((s + 0.5) / slotCount);
        const slot = addBox(THREE, group, [1.4, 1.2, 0.4], [sx, deckHeight + 1.2, railZ], darkDetailMaterial);
        slot.rotation.y = direction * 0.35;
      }

      // Manifolds internos de abastecimento offshore (lama, combustível, água doce)
      for (let m = 0; m < 3; m += 1) {
        const mx = aftDeckCenterX + (m - 1) * 6.5;
        const mfPipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8),
          m === 0 ? new THREE.MeshStandardMaterial({ color: "#dc2626" }) : m === 1 ? new THREE.MeshStandardMaterial({ color: "#2563eb" }) : safetyYellowMat
        );
        mfPipe.position.set(mx, deckHeight + 1.4, railZ - side * 0.35);
        group.add(mfPipe);
      }
    }

    // 8. Rolo de Popa (Stern Roller) no espelho
    const sternRoller = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, beam * 0.48, 16), darkDetailMaterial);
    sternRoller.rotation.x = Math.PI / 2;
    sternRoller.position.set(aftDeckEnd, deckHeight + 0.65, 0);
    group.add(sternRoller);

    // 9. Equipamento Especial Offshore: Torre Subsea / Guindaste Pedestal Articulado (DOF/MMC)
    const craneMat = isDiving ? new THREE.MeshStandardMaterial({ color: "#1e3a8a", metalness: 0.4 }) : subseaBlueMat;
    const craneBaseX = fwdHouseX - direction * (houseLen * 0.5 + 4.5);
    const craneZ = direction * (beam * 0.28);
    const cranePedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 7.8, 12), craneMat);
    cranePedestal.position.set(craneBaseX, deckHeight + 3.9, craneZ);
    group.add(cranePedestal);
    addBox(THREE, group, [3.2, 2.4, 2.6], [craneBaseX, deckHeight + 8.8, craneZ], craneMat);
    addBox(THREE, group, [1.4, 1.2, 1.8], [craneBaseX - direction * 1.6, deckHeight + 9.0, craneZ], darkDetailMaterial);
    const boomLen = loa * 0.28;
    const craneBoom = addBox(THREE, group, [boomLen, 0.9, 0.9], [craneBaseX - direction * (boomLen * 0.42), deckHeight + 11.2, craneZ], craneMat);
    craneBoom.rotation.z = direction * 0.18;
    const craneCable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.5, 6), darkDetailMaterial);
    craneCable.position.set(craneBaseX - direction * (boomLen * 0.85), deckHeight + 8.0, craneZ);
    group.add(craneCable);
    addBox(THREE, group, [0.8, 1.2, 0.8], [craneBaseX - direction * (boomLen * 0.85), deckHeight + 4.8, craneZ], safetyYellowMat);

    // 10. Bote de Resgate Rápido (FRC - Fast Rescue Craft) em Turco
    const frcZ = -direction * (beam * 0.42);
    const frcX = fwdHouseX - direction * (houseLen * 0.3);
    const frcMat = new THREE.MeshStandardMaterial({ color: "#ea580c", roughness: 0.4 });
    addBox(THREE, group, [5.2, 1.4, 2.0], [frcX, deckHeight + 3.8, frcZ], frcMat);
    addBox(THREE, group, [0.3, 2.8, 0.3], [frcX, deckHeight + 4.5, frcZ + (frcZ > 0 ? -0.8 : 0.8)], darkDetailMaterial);

    // Castelo de proa elevado e fechado (flared forecastle)
    const fwdBowX = direction * (loa * 0.44);
    addBox(THREE, group, [loa * 0.12, 3.2, beam * 0.74], [fwdBowX, deckHeight + 1.6, 0], hullMaterial);
    const bowMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.2, 8), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
    bowMast.position.set(direction * (loa * 0.48), deckHeight + 4.2, 0);
    group.add(bowMast);
  } else if (isResearch) {
    // =========================================================================
    // 🛰️ MODELO RESEARCH SURVEY VESSEL (ex: OCEAN MERMAID, Fugro, Oceanográfico)
    // Superestrutura Meio-Proa, Convés Científico Livre na Popa com Pórtico A
    // =========================================================================
    const fwdHouseX = direction * (loa * 0.16);
    const houseLen = Math.max(16, Math.min(loa * 0.28, 38));
    const houseH = 11.5;
    const houseMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.6 });
    const safetyOrangeMat = new THREE.MeshStandardMaterial({ color: "#ea580c", roughness: 0.4 });
    const oceanBlueMat = new THREE.MeshStandardMaterial({ color: "#1e40af", roughness: 0.5 });
    const brightYellowMat = new THREE.MeshStandardMaterial({ color: "#eab308", roughness: 0.4 });

    // 1. Bloco de Acomodações e Laboratórios Científicos
    addBox(THREE, group, [houseLen, houseH, beam * 0.82], [fwdHouseX, deckHeight + houseH / 2, 0], houseMat);

    // Decks e janelas horizontais dos laboratórios (química, biologia, acústica)
    for (let f = 1; f < 3; f += 1) {
      const fY = deckHeight + f * 3.4;
      addBox(THREE, group, [houseLen * 1.02, 0.2, beam * 0.84], [fwdHouseX, fY, 0], darkDetailMaterial);
      addBox(THREE, group, [0.1, 0.5, beam * 0.62], [fwdHouseX + direction * (houseLen * 0.51), fY + 1.2, 0], windowMaterial);
      [-beam * 0.415, beam * 0.415].forEach((wz) => {
        addBox(THREE, group, [houseLen * 0.7, 0.5, 0.1], [fwdHouseX, fY + 1.2, wz], windowMaterial);
      });
    }

    // 2. Passadiço Panorâmico de Navegação e Pesquisa (Observation Wheelhouse)
    const bridgeY = deckHeight + houseH;
    const bridgeH = 3.8;
    const bridgeLen = houseLen * 0.74;
    const bridgeW = Math.max(beam * 0.94, beam + 0.5);
    addBox(THREE, group, [bridgeLen, bridgeH, bridgeW], [fwdHouseX, bridgeY + bridgeH / 2, 0], houseMat);

    // Janelas panorâmicas à proa
    addBox(THREE, group, [0.25, 1.4, bridgeW * 0.9], [fwdHouseX + direction * (bridgeLen * 0.5 + 0.05), bridgeY + bridgeH * 0.56, 0], windowMaterial);
    // Janelas de observação à ré voltadas para os guinchos e pórtico A
    addBox(THREE, group, [0.25, 1.4, bridgeW * 0.9], [fwdHouseX - direction * (bridgeLen * 0.5 + 0.05), bridgeY + bridgeH * 0.56, 0], windowMaterial);
    [-bridgeW * 0.49, bridgeW * 0.49].forEach((wz) => {
      addBox(THREE, group, [bridgeLen * 0.8, 1.3, 0.2], [fwdHouseX, bridgeY + bridgeH * 0.56, wz], windowMaterial);
    });

    // 3. Teto do Passadiço e Mastro Científico
    const roofY = bridgeY + bridgeH;
    addBox(THREE, group, [bridgeLen * 1.03, 0.35, bridgeW * 1.02], [fwdHouseX, roofY + 0.18, 0], houseMat);

    // Torre do mastro oceanográfico com sensores meteorológicos e radares
    const mastX = fwdHouseX;
    const mastTower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 9.2, 8), darkDetailMaterial);
    mastTower.position.set(mastX, roofY + 4.6, 0);
    group.add(mastTower);
    addBox(THREE, group, [0.35, 0.35, 5.8], [mastX, roofY + 6.8, 0], darkDetailMaterial);
    addBox(THREE, group, [0.3, 0.3, 4.2], [mastX, roofY + 8.8, 0], new THREE.MeshStandardMaterial({ color: "#ffffff" }));

    // Cúpulas Satcom esféricas (Comunicações de dados científicos)
    [-beam * 0.28, 0, beam * 0.28].forEach((dz, idx) => {
      const satcom = new THREE.Mesh(new THREE.SphereGeometry(idx === 1 ? 1.4 : 1.1, 14, 12), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }));
      satcom.position.set(mastX - direction * (bridgeLen * 0.2), roofY + 1.4, dz);
      group.add(satcom);
    });

    // Chaminés duplas compactas logo na ré da casaria
    const funnelX = fwdHouseX - direction * (houseLen * 0.46);
    [-beam * 0.24, beam * 0.24].forEach((fz) => {
      addBox(THREE, group, [2.8, 5.2, 1.6], [funnelX, deckHeight + houseH * 0.75, fz], oceanBlueMat);
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.0, 8), darkDetailMaterial);
      exhaust.position.set(funnelX, deckHeight + houseH * 0.75 + 3.4, fz);
      group.add(exhaust);
    });

    // 4. Lancha de Pesquisa Hidrográfica / Rescue Boat em Turco
    const boatZ = -direction * (beam * 0.43);
    const boatX = fwdHouseX - direction * (houseLen * 0.15);
    addBox(THREE, group, [6.2, 1.6, 2.3], [boatX, deckHeight + 4.2, boatZ], safetyOrangeMat);
    addBox(THREE, group, [0.4, 3.2, 0.4], [boatX, deckHeight + 4.8, boatZ + (boatZ > 0 ? -0.8 : 0.8)], darkDetailMaterial);

    // 5. Convés de Operações Científicas de Ré (Aft Working Survey Deck)
    const aftDeckStart = fwdHouseX - direction * (houseLen * 0.52);
    const aftDeckEnd = -direction * (loa * 0.48);
    const surveyDeckLen = Math.abs(aftDeckEnd - aftDeckStart);

    // Amuradas de proteção do convés de pesquisa
    [-beam * 0.47, beam * 0.47].forEach((bz) => {
      addBox(THREE, group, [surveyDeckLen * 0.95, 1.35, 0.35], [(aftDeckStart + aftDeckEnd) / 2, deckHeight + 0.68, bz], hullMaterial);
    });

    // Pórtico A Hidráulico na Popa (Hydraulic Stern A-Frame) - Ícone de navios de pesquisa
    const aFrameX = aftDeckEnd;
    const aFrameH = Math.max(9.0, beam * 0.45);
    const aFrameW = beam * 0.62;
    [-aFrameW / 2, aFrameW / 2].forEach((az) => {
      const leg = addBox(THREE, group, [0.75, aFrameH, 0.75], [aFrameX, deckHeight + aFrameH / 2, az], safetyOrangeMat);
      // Inclinação para fora da popa para lançamento de equipamentos
      leg.rotation.z = -direction * 0.24;
    });
    // Viga transversal superior do A-Frame
    const topBarX = aFrameX - direction * (aFrameH * Math.sin(0.24));
    const topBarY = deckHeight + aFrameH * Math.cos(0.24);
    addBox(THREE, group, [0.85, 0.9, aFrameW * 1.05], [topBarX, topBarY, 0], safetyOrangeMat);
    // Roldana / Bloco de cabo central no topo
    const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 14), darkDetailMaterial);
    sheave.rotation.x = Math.PI / 2;
    sheave.position.set(topBarX, topBarY - 0.7, 0);
    group.add(sheave);

    // Cilindros hidráulicos de acionamento do A-Frame
    [-aFrameW * 0.44, aFrameW * 0.44].forEach((cz) => {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.8, 8), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.8 }));
      cyl.rotation.z = -direction * 0.55;
      cyl.position.set(aFrameX + direction * 2.2, deckHeight + 2.5, cz);
      group.add(cyl);
    });

    // 6. Guinchos Oceanográficos de Cabo e Roseta CTD
    const winchX = aftDeckStart - direction * 3.5;
    [-beam * 0.22, beam * 0.22].forEach((wz) => {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 14), oceanBlueMat);
      drum.rotation.x = Math.PI / 2;
      drum.position.set(winchX, deckHeight + 1.2, wz);
      group.add(drum);
      addBox(THREE, group, [1.8, 1.8, 0.3], [winchX, deckHeight + 1.2, wz - 1.0], darkDetailMaterial);
      addBox(THREE, group, [1.8, 1.8, 0.3], [winchX, deckHeight + 1.2, wz + 1.0], darkDetailMaterial);
    });

    // 7. Equipamento CTD Rosette (Amostrador de água com carrossel cilíndrico)
    const ctdX = aftDeckStart - direction * 7.5;
    const ctdZ = direction * (beam * 0.25);
    const ctdFrame = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 12), new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.4, metalness: 0.5 }));
    ctdFrame.position.set(ctdX, deckHeight + 1.3, ctdZ);
    group.add(ctdFrame);
    addBox(THREE, group, [0.3, 3.8, 0.3], [ctdX, deckHeight + 1.9, ctdZ + 1.5], safetyOrangeMat);

    // 8. Guindaste Articulado de Convés Científico (Knuckle Boom Deck Crane)
    const craneX = aftDeckStart - direction * (surveyDeckLen * 0.42);
    const craneZ = -direction * (beam * 0.28);
    const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.2, 10), brightYellowMat);
    craneBase.position.set(craneX, deckHeight + 2.1, craneZ);
    group.add(craneBase);
    addBox(THREE, group, [2.4, 1.8, 2.0], [craneX, deckHeight + 4.9, craneZ], brightYellowMat);
    const boomLen = loa * 0.22;
    const craneBoom = addBox(THREE, group, [boomLen, 0.7, 0.7], [craneX - direction * (boomLen * 0.45), deckHeight + 6.6, craneZ], brightYellowMat);
    craneBoom.rotation.z = direction * 0.2;

    // 9. Contêineres Laboratório Científicos Modulares (Lab Vans 20ft em branco/azul marinho)
    const labX = aftDeckStart - direction * (surveyDeckLen * 0.58);
    [-beam * 0.18, beam * 0.18].forEach((lz, idx) => {
      addBox(THREE, group, [6.0, 2.6, 2.4], [labX, deckHeight + 1.3, lz], new THREE.MeshStandardMaterial({ color: idx === 0 ? "#f1f5f9" : "#1e40af", roughness: 0.6 }));
      addBox(THREE, group, [0.1, 1.8, 1.1], [labX - direction * 3.01, deckHeight + 1.3, lz], darkDetailMaterial);
    });

    // 10. Castelo de Proa com Mastro de Vante
    const bowX = direction * (loa * 0.44);
    addBox(THREE, group, [loa * 0.12, 2.8, beam * 0.76], [bowX, deckHeight + 1.4, 0], hullMaterial);
    const fwdMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.5, 8), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
    fwdMast.position.set(direction * (loa * 0.48), deckHeight + 4.2, 0);
    group.add(fwdMast);
  } else {
    // =========================================================================
    // 🚢 MODELOS CONVENCIONAIS (CONTAINER, CHEMICAL TANKER, PRODUCT TANKER, GENERAL CARGO)
    // Superestrutura na RÉ
    // =========================================================================
    const tiers = beam >= 40 ? 4 : beam >= 32 ? 3 : 2;
    const topContainerY = deckHeight + 1.38 + tiers * 2.68;
    const towerHeight = isContainer ? Math.max(15.2, topContainerY - deckHeight + 4.2) : 13.5;
    const houseLength = isContainer
      ? Math.max(8, Math.min(loa * 0.045, 14))
      : Math.max(16, Math.min(loa * 0.12, 38));
    const houseMaterial = new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.62 });
    const funnelColor = isTanker ? "#ea580c" : (VESSEL_COLORS[vessel.color]?.stroke ?? "#285a78");
    const funnelMaterial = new THREE.MeshStandardMaterial({ color: funnelColor, roughness: 0.65 });

    const sternHouseX = direction * (-loa * 0.35);

    // 1. Bloco de Acomodações Multi-andares
    addBox(THREE, group, [houseLength, towerHeight, beam * 0.68], [sternHouseX, deckHeight + towerHeight / 2, 0], houseMaterial);

    const deckFloors = Math.floor(towerHeight / 2.8);
    for (let f = 1; f < deckFloors; f += 1) {
      const floorY = deckHeight + f * 2.8;
      addBox(THREE, group, [houseLength * 1.02, 0.2, beam * 0.69], [sternHouseX, floorY, 0], darkDetailMaterial);
      addBox(THREE, group, [0.1, 0.45, beam * 0.52], [sternHouseX + direction * (houseLength * 0.51), floorY + 1.1, 0], windowMaterial);
    }

    // 2. Convés do Passadiço / Ponte de Comando
    const bridgeBottomY = deckHeight + towerHeight;
    const bridgeHeight = 3.8;
    const bridgeCenterY = bridgeBottomY + bridgeHeight / 2;
    const bridgeLength = houseLength * 0.78;
    const bridgeX = sternHouseX + direction * (houseLength * 0.08);

    addBox(THREE, group, [bridgeLength, bridgeHeight, beam * 0.72], [bridgeX, bridgeCenterY, 0], houseMaterial);

    const wingWidth = Math.max(beam * 0.96, beam + 0.6);
    addBox(THREE, group, [bridgeLength * 0.72, 1.1, wingWidth], [bridgeX, bridgeBottomY + 0.55, 0], houseMaterial);
    addBox(THREE, group, [0.3, 1.4, wingWidth], [bridgeX + direction * (bridgeLength * 0.36), bridgeBottomY + 1.8, 0], houseMaterial);
    [-wingWidth * 0.47, wingWidth * 0.47].forEach((wz) => {
      addBox(THREE, group, [bridgeLength * 0.6, 2.3, 2.5], [bridgeX, bridgeBottomY + 1.75, wz], houseMaterial);
    });

    // Janelas de navegação (proa)
    addBox(THREE, group, [0.3, 1.25, beam * 0.73], [bridgeX + direction * (bridgeLength * 0.5 + 0.05), bridgeCenterY + 0.4, 0], windowMaterial);
    [-beam * 0.362, beam * 0.362].forEach((wz) => {
      addBox(THREE, group, [bridgeLength * 0.75, 1.1, 0.3], [bridgeX, bridgeCenterY + 0.4, wz], windowMaterial);
    });
    [-wingWidth * 0.47, wingWidth * 0.47].forEach((wz) => {
      addBox(THREE, group, [bridgeLength * 0.5, 0.95, 0.3], [bridgeX, bridgeCenterY + 0.4, wz], windowMaterial);
    });

    // 3. Teto do Passadiço (Monkey Island)
    const roofY = bridgeBottomY + bridgeHeight;
    addBox(THREE, group, [bridgeLength * 1.04, 0.4, beam * 0.76], [bridgeX, roofY + 0.2, 0], houseMaterial);

    const mastGeo = new THREE.CylinderGeometry(0.32, 0.65, 8.8, 8);
    const mast = new THREE.Mesh(mastGeo, darkDetailMaterial);
    mast.position.set(bridgeX, roofY + 4.6, 0);
    group.add(mast);

    addBox(THREE, group, [0.45, 0.38, beam * 0.3], [bridgeX, roofY + 6.2, 0], darkDetailMaterial);
    addBox(THREE, group, [0.38, 0.36, 4.4], [bridgeX, roofY + 8.6, 0], new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));
    addBox(THREE, group, [0.35, 0.32, 3.4], [bridgeX, roofY + 7.0, beam * 0.09], new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));

    [-beam * 0.24, beam * 0.24].forEach((dz) => {
      const domeGeo = new THREE.SphereGeometry(1.1, 14, 12);
      const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.28 }));
      dome.position.set(bridgeX - direction * (bridgeLength * 0.18), roofY + 1.3, dz);
      group.add(dome);
    });

    // 4. Chaminé (Funnel) na ré da casaria
    const funnelHeight = isTanker ? towerHeight * 0.8 : towerHeight * 0.88;
    const funnelWidth = beam * 0.24;
    const funnelLength = houseLength * 0.38;
    const funnelX = sternHouseX - direction * (houseLength * 0.38);
    addBox(THREE, group, [funnelLength, funnelHeight, funnelWidth], [funnelX, deckHeight + funnelHeight / 2, 0], funnelMaterial);
    [-funnelWidth * 0.24, funnelWidth * 0.24].forEach((pz) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 8), darkDetailMaterial);
      pipe.position.set(funnelX, deckHeight + funnelHeight + 1.2, pz);
      group.add(pipe);
    });

    // Equipamentos náuticos da Proa / Castelo para navios tanque (sem caixas/tampão sobressalente)
    if (isTanker) {
      // 1. Quebra-mar em V clássico (Wave deflector / Breakwater) protegendo o convés de carga
      const bwX = direction * (loa * 0.365);
      const bwWingLength = beam * 0.38;
      const bwMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.6 });
      for (const side of [-1, 1]) {
        const wing = addBox(THREE, group, [loa * 0.032, 1.35, bwWingLength], [bwX, deckHeight + 0.68, side * (bwWingLength * 0.32)], bwMat);
        wing.rotation.y = direction * side * 0.46;
      }
      // Reforço central do quebra-mar
      addBox(THREE, group, [0.35, 1.35, 0.35], [bwX + direction * (loa * 0.012), deckHeight + 0.68, 0], bwMat);

      // 2. Guinchos de amarração e molinetes de âncora instalados diretamente sobre o convés afunilado da proa
      const winchX = direction * (loa * 0.425);
      [-beam * 0.14, beam * 0.14].forEach((wz) => {
        // Base / pedestal do guincho
        addBox(THREE, group, [2.2, 0.45, 1.6], [winchX, deckHeight + 0.23, wz], darkDetailMaterial);
        // Tambor de cabos
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10), darkDetailMaterial);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(winchX, deckHeight + 0.85, wz);
        group.add(drum);
        // Molinete de corrente / barbotim
        const wildcat = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 8), darkDetailMaterial);
        wildcat.rotation.z = Math.PI / 2;
        wildcat.position.set(winchX + direction * 0.7, deckHeight + 0.85, wz);
        group.add(wildcat);
      });

      // 3. Buzinas de amarração / cabeços duplos de proa
      [-beam * 0.18, beam * 0.18].forEach((bz) => {
        const bitt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), darkDetailMaterial);
        bitt.position.set(direction * (loa * 0.45), deckHeight + 0.45, bz);
        group.add(bitt);
      });

      // 4. Mastro de vante (Foremast / Jackstaff com farolete de navegação no bico da proa)
      const fwdMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5.8, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }));
      fwdMast.position.set(direction * (loa * 0.485), deckHeight + 2.9, 0);
      group.add(fwdMast);

      // Farolete de proa
      const navLight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 8), new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.2 }));
      navLight.position.set(direction * (loa * 0.485), deckHeight + 5.8, 0);
      group.add(navLight);
    }

    // Bulbo de Proa submerso
    const bulbMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.6 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(beam * 0.19, 12, 10), bulbMat);
    bulb.scale.set(1.7, 0.9, 0.85);
    bulb.position.set(direction * (loa * 0.49), -draft * 0.5, 0);
    group.add(bulb);

    if (isTanker) {
      // Baleeira de queda livre na popa
      const rampX = sternHouseX - direction * (houseLength * 0.68);
      const lifeboatRamp = addBox(THREE, group, [5.4, 0.5, 2.6], [rampX, deckHeight + 3.8, 0], new THREE.MeshStandardMaterial({ color: "#475569" }));
      lifeboatRamp.rotation.z = direction * 0.68;
      const lifeboat = addBox(THREE, group, [4.4, 1.85, 2.1], [rampX + direction * 0.5, deckHeight + 4.8, 0], new THREE.MeshStandardMaterial({ color: "#f97316", roughness: 0.35 }));
      lifeboat.rotation.z = direction * 0.68;

      // Equipamentos do Chemical / Product Tanker (catwalk, pipe racks, pipes, gantry, manifold)
      const pipeRackMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
      const pipeMatStainless = new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.35, metalness: 0.7 });
      const valveMatYellow = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.35, metalness: 0.5 });
      const gantryMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });

      const cargoStart = -loa * 0.25;
      const cargoEnd = loa * 0.35;
      const cargoLength = cargoEnd - cargoStart;
      const rackCount = Math.max(12, Math.min(22, Math.floor(cargoLength / 9)));
      const rackSpacing = cargoLength / rackCount;

      const catwalkY = deckHeight + 1.6;
      addBox(THREE, group, [cargoLength, 0.3, 2.0], [0, catwalkY, 0], new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.8 }));
      [-0.95, 0.95].forEach((rz) => {
        addBox(THREE, group, [cargoLength, 0.1, 0.1], [0, catwalkY + 0.85, rz], pipeRackMat);
      });

      for (let r = 0; r < rackCount; r += 1) {
        const rx = cargoStart + (r + 0.5) * rackSpacing;
        if (Math.abs(rx) < 6.5) continue;

        [-beam * 0.24, beam * 0.24].forEach((rz) => {
          addBox(THREE, group, [0.35, 0.25, beam * 0.34], [rx, deckHeight + 0.8, rz], pipeRackMat);
          addBox(THREE, group, [0.35, 1.2, 0.25], [rx, deckHeight + 0.6, rz + (rz > 0 ? 1 : -1) * (beam * 0.16)], pipeRackMat);
        });

        if (r % 3 === 1) {
          [-beam * 0.28, beam * 0.28].forEach((dz) => {
            const dome = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.08, beam * 0.08, 0.9, 10), pipeRackMat);
            dome.position.set(rx, deckHeight + 0.45, dz);
            group.add(dome);
            const pvMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), darkDetailMaterial);
            pvMast.position.set(rx, deckHeight + 1.8, dz);
            group.add(pvMast);
            const pvCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.4, 8), valveMatYellow);
            pvCap.position.set(rx, deckHeight + 3.0, dz);
            group.add(pvCap);
          });
        }
      }

      for (const side of [-1, 1]) {
        for (let p = 0; p < 3; p += 1) {
          const pipeZ = side * (1.8 + p * (beam * 0.085));
          const pipeGeo = new THREE.CylinderGeometry(0.22, 0.22, cargoLength, 8);
          const pipe = new THREE.Mesh(pipeGeo, pipeMatStainless);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(0, deckHeight + 0.95, pipeZ);
          group.add(pipe);
        }
      }

      const manifoldW = Math.max(9, Math.min(18, loa * 0.055));
      addBox(THREE, group, [manifoldW, 0.35, beam * 0.96], [0, deckHeight + 0.2, 0], new THREE.MeshStandardMaterial({ color: "#334155" }));
      addBox(THREE, group, [manifoldW * 0.8, 2.8, beam * 0.90], [0, deckHeight + 1.6, 0], new THREE.MeshStandardMaterial({ color: "#991b1b", roughness: 0.5 }));
      [-beam * 0.44, beam * 0.44].forEach((vz) => {
        addBox(THREE, group, [manifoldW * 0.72, 1.4, 1.3], [0, deckHeight + 2.0, vz], new THREE.MeshStandardMaterial({ color: "#dc2626", metalness: 0.7 }));
      });
      addBox(THREE, group, [5.2, 3.6, beam * 0.32], [direction * 4.8, deckHeight + 1.8, -direction * beam * 0.12], gantryMat);

      const gantryHeight = 7.8;
      const gantrySpan = beam * 0.76;
      [-3.2, 3.2].forEach((gx) => {
        [-gantrySpan / 2, gantrySpan / 2].forEach((gz) => {
          addBox(THREE, group, [0.45, gantryHeight, 0.45], [gx, deckHeight + gantryHeight / 2, gz], gantryMat);
        });
        addBox(THREE, group, [0.55, 0.65, gantrySpan], [gx, deckHeight + gantryHeight, 0], gantryMat);
      });
      [-gantrySpan / 2, gantrySpan / 2].forEach((gz) => {
        addBox(THREE, group, [6.5, 0.55, 0.45], [0, deckHeight + gantryHeight, gz], gantryMat);
      });
      addBox(THREE, group, [2.2, 0.6, 2.2], [0, deckHeight + gantryHeight - 0.4, 0], new THREE.MeshStandardMaterial({ color: "#eab308" }));
    } else if (isContainer) {
      const bayCount = normalizeBayCount(vessel.bayCount ?? vessel.bays ?? vessel.maxBayNumber);
      const baySlots = bayCount ? bayNumberSequence(bayCount).length : 0;
      const columns = Math.max(1, Math.min(40, baySlots || Math.max(4, Math.floor(loa / 16))));
      // Fileiras transversais (boca) modeladas na proporção real de contêineres marítimos (~2.44m de largura ISO)
      const usableBeam = beam * 0.82;
      const rows = Math.max(4, Math.min(16, Math.round(usableBeam / 2.7)));
      const rowSpacing = usableBeam / rows;
      const containerWidth = Math.max(2.1, rowSpacing - 0.28);
      const tiers = beam >= 40 ? 4 : beam >= 32 ? 3 : 2;

      const cargoStartFromStern = loa * 0.03;
      const cargoLength = loa * 0.9;
      const columnSpacing = cargoLength / columns;
      // Comprimento longitudinal proporcional ao slot (formato retangular nítido de contêiner 20'/40' pés)
      const containerLength = Math.max(5.8, Math.min(12.2, columnSpacing * 0.92));
      const containerHeight = 2.55;

      const containerGeometry = new THREE.BoxGeometry(containerLength, containerHeight, containerWidth);
      const containerMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 });
      const instanceCount = columns * rows * tiers;
      const containers = new THREE.InstancedMesh(containerGeometry, containerMaterial, instanceCount);
      const cornerMaterial = new THREE.MeshStandardMaterial({ color: "#8a969b", roughness: 0.74, metalness: 0.16 });
      const cornerPosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 2.48, 0.24), cornerMaterial, instanceCount * 4);
      const pose = new THREE.Object3D();
      let index = 0;
      let cornerIndex = 0;
      const bridgeStartX = Math.min(sternHouseX - houseLength / 2, bridgeX - bridgeLength / 2) - 0.7;
      const bridgeEndX = Math.max(sternHouseX + houseLength / 2, bridgeX + bridgeLength / 2) + 0.7;

      for (let column = 0; column < columns; column += 1) {
        const fromStern = cargoStartFromStern + columnSpacing * (column + 0.5);
        const containerX = direction * (fromStern - loa / 2);
        const containerMinX = containerX - containerLength / 2;
        const containerMaxX = containerX + containerLength / 2;
        if (containerMinX < bridgeEndX && containerMaxX > bridgeStartX) continue;

        for (let row = 0; row < rows; row += 1) {
          for (let tier = 0; tier < tiers; tier += 1) {
            const containerY = deckHeight + 1.38 + tier * 2.68;
            const containerZ = (row - (rows - 1) / 2) * rowSpacing;
            pose.position.set(containerX, containerY, containerZ);
            pose.updateMatrix();
            containers.setMatrixAt(index, pose.matrix);
            containers.setColorAt(index, new THREE.Color(CONTAINER_COLORS_3D[(column + row * 2 + tier * 3) % CONTAINER_COLORS_3D.length]));

            for (const xSide of [-1, 1]) {
              for (const zSide of [-1, 1]) {
                pose.position.set(
                  containerX + (xSide * (containerLength - 0.26)) / 2,
                  containerY,
                  containerZ + (zSide * (containerWidth - 0.26)) / 2,
                );
                pose.updateMatrix();
                cornerPosts.setMatrixAt(cornerIndex, pose.matrix);
                cornerIndex += 1;
              }
            }
            index += 1;
          }
        }
      }

      containers.count = index;
      cornerPosts.count = cornerIndex;
      containers.instanceMatrix.needsUpdate = true;
      if (containers.instanceColor) containers.instanceColor.needsUpdate = true;
      cornerPosts.instanceMatrix.needsUpdate = true;
      group.add(containers);
      group.add(cornerPosts);
    } else {
      // 📦 Carga Geral / Graneleiro: braçolas, escotilhas e guindastes de convés
      const hatchMaterial = new THREE.MeshStandardMaterial({ color: "#596a7a", roughness: 0.9 });
      const craneMaterial = new THREE.MeshStandardMaterial({ color: "#0284c7", roughness: 0.5 });
      const count = Math.max(3, Math.min(6, Math.floor(loa / 55)));
      const hatchLength = (loa * 0.52) / count;
      for (let index = 0; index < count; index += 1) {
        const distance = loa * (0.22 + (0.58 * (index + 0.5)) / count);
        const hatchX = direction * (distance - loa / 2);
        addBox(
          THREE,
          group,
          [hatchLength, 2.3, beam * 0.68],
          [hatchX, deckHeight + 1.5, 0],
          hatchMaterial,
        );
        // Guindastes de convés entre as escotilhas
        if (index < count - 1) {
          const craneX = hatchX + direction * (hatchLength * 0.7);
          const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 5.5, 10), craneMaterial);
          pedestal.position.set(craneX, deckHeight + 2.75, 0);
          group.add(pedestal);
          addBox(THREE, group, [2.4, 2.0, 2.2], [craneX, deckHeight + 6.0, 0], craneMaterial);
          const craneBoom = addBox(THREE, group, [hatchLength * 0.85, 0.65, 0.65], [craneX + direction * (hatchLength * 0.38), deckHeight + 7.8, 0], craneMaterial);
          craneBoom.rotation.z = -direction * 0.35;
        }
      }
    }
  }

  addVesselNameplate(THREE, group, vessel, loa, beam, deckHeight);
  return { deckHeight };
}

type BeamSegment3D = {
  start: [number, number, number];
  end: [number, number, number];
};

function addBoxBeamBatch(
  THREE: ThreeModule,
  parent: ThreeObject,
  segments: BeamSegment3D[],
  section: [number, number],
  material: import("three").Material,
) {
  if (!segments.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(section[0], 1, section[1]), material, segments.length);
  const pose = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  segments.forEach(({ start: startPoint, end: endPoint }, index) => {
    const start = new THREE.Vector3(...startPoint);
    const end = new THREE.Vector3(...endPoint);
    const direction = end.clone().sub(start);
    const length = direction.length();
    pose.position.copy(start).add(end).multiplyScalar(0.5);
    pose.quaternion.setFromUnitVectors(up, direction.normalize());
    pose.scale.set(1, length, 1);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}

function addRoundBeamBatch(
  THREE: ThreeModule,
  parent: ThreeObject,
  segments: BeamSegment3D[],
  radius: number,
  material: import("three").Material,
) {
  if (!segments.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 6), material, segments.length);
  const pose = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  segments.forEach(({ start: startPoint, end: endPoint }, index) => {
    const start = new THREE.Vector3(...startPoint);
    const end = new THREE.Vector3(...endPoint);
    const direction = end.clone().sub(start);
    const length = direction.length();
    pose.position.copy(start).add(end).multiplyScalar(0.5);
    pose.quaternion.setFromUnitVectors(up, direction.normalize());
    pose.scale.set(1, length, 1);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}

function addPortainer(
  THREE: ThreeModule,
  scene: import("three").Scene,
  portainer: NonNullable<Scenario["portainers"]>[number],
  total: number,
) {
  if (!portainer.enabled) return;
  const group = new THREE.Group();
  group.position.x = stationToX(portainer.position, total);

  const craneColor = new THREE.Color(portainer.color || "#15803d");
  const braceColor = craneColor.clone().lerp(new THREE.Color("#eef2f3"), 0.42);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: craneColor, roughness: 0.64, metalness: 0.22 });
  const braceMaterial = new THREE.MeshStandardMaterial({ color: braceColor, roughness: 0.7, metalness: 0.16 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#39474d", roughness: 0.76, metalness: 0.22 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: "#244859", roughness: 0.3, metalness: 0.2 });
  const paleMaterial = new THREE.MeshStandardMaterial({ color: "#e7ecee", roughness: 0.65, metalness: 0.06 });
  const spreaderMaterial = new THREE.MeshStandardMaterial({ color: "#e5b52a", roughness: 0.62, metalness: 0.16 });

  const groundY = QUAY_TOP_Y + 1.35;
  const topY = 28.5;
  const landBaseZ = -21;
  const landTopZ = -19.5;
  const waterBaseZ = -1.2;
  const waterTopZ = -4.0;
  const watersideLegs: BeamSegment3D[] = [];
  const landsideLegs: BeamSegment3D[] = [];
  const legFootings: Array<[number, number, number]> = [];
  const wheelPositions: Array<[number, number, number]> = [];

  for (const xSide of [-1, 1]) {
    for (const [isWaterside, baseZ, topZ] of [
      [false, landBaseZ, landTopZ],
      [true, waterBaseZ, waterTopZ],
    ] as const) {
      const baseX = xSide * 10;
      const topX = xSide * 7.7;
      const segment = {
        start: [baseX, groundY, baseZ] as [number, number, number],
        end: [topX, topY, topZ] as [number, number, number],
      };
      (isWaterside ? watersideLegs : landsideLegs).push(segment);
      legFootings.push([baseX, groundY, baseZ]);
      for (let wheel = 0; wheel < 4; wheel += 1) {
        wheelPositions.push([baseX + (wheel - 1.5) * 1.35, QUAY_TOP_Y + 0.93, baseZ - 1.0]);
        wheelPositions.push([baseX + (wheel - 1.5) * 1.35, QUAY_TOP_Y + 0.93, baseZ + 1.0]);
      }
    }
  }

  addBoxBeamBatch(THREE, group, landsideLegs, [1.45, 1.65], frameMaterial);
  addBoxBeamBatch(THREE, group, watersideLegs, [1.9, 2.0], frameMaterial);
  for (const [x, , z] of legFootings) {
    addBox(THREE, group, [7.3, 0.95, 4.0], [x, groundY, z], darkMaterial);
  }
  const wheelMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.68, 0.68, 1.15, 12), darkMaterial, wheelPositions.length);
  const wheelPose = new THREE.Object3D();
  wheelPositions.forEach(([x, y, z], index) => {
    wheelPose.position.set(x, y, z);
    wheelPose.rotation.x = Math.PI / 2;
    wheelPose.updateMatrix();
    wheelMesh.setMatrixAt(index, wheelPose.matrix);
  });
  wheelMesh.instanceMatrix.needsUpdate = true;
  group.add(wheelMesh);

  const portalMembers: BeamSegment3D[] = [];
  const portalBraces: BeamSegment3D[] = [];
  for (const xSide of [-1, 1]) {
    const x = xSide * 7.7;
    portalMembers.push(
      { start: [x, 8.5, landTopZ], end: [x, 8.5, waterTopZ] },
      { start: [x, 18.5, landTopZ], end: [x, 18.5, waterTopZ] },
    );
    portalBraces.push(
      { start: [xSide * 9.5, 6, landBaseZ], end: [x, 21, waterTopZ] },
      { start: [xSide * 9.5, 6, waterBaseZ], end: [x, 21, landTopZ] },
    );
  }
  const portalCrossbeams: BeamSegment3D[] = [
    { start: [-8, topY, landTopZ], end: [8, topY, landTopZ] },
    { start: [-8, topY, waterTopZ], end: [8, topY, waterTopZ] },
    { start: [-7.7, 18.5, landTopZ], end: [7.7, 18.5, landTopZ] },
    { start: [-7.7, 18.5, waterTopZ], end: [7.7, 18.5, waterTopZ] },
  ];
  addBoxBeamBatch(THREE, group, portalMembers, [0.9, 0.9], braceMaterial);
  addBoxBeamBatch(THREE, group, portalBraces, [0.72, 0.72], braceMaterial);
  addBoxBeamBatch(THREE, group, portalCrossbeams, [1.3, 1.3], frameMaterial);
  addBox(THREE, group, [17.5, 2.0, 22.8], [0, topY, (landTopZ + waterTopZ) / 2], frameMaterial);

  addBox(THREE, group, [10.5, 4.7, 8.5], [0, 31.5, -15.0], paleMaterial);
  addBox(THREE, group, [8.0, 3.4, 4.2], [0, 31.1, -23.0], darkMaterial);
  addBox(THREE, group, [5.8, 0.42, 8.6], [0, 32.2, -15.0], glassMaterial);
  const cableReel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 16), darkMaterial);
  cableReel.rotation.z = Math.PI / 2;
  cableReel.position.set(0, 12.0, -17.3);
  group.add(cableReel);

  const boomStartZ = -2.5;
  const boomEndZ = 49;
  const boomBottomY = 32.6;
  const boomTopY = 37.0;
  const boomHalfWidth = 4.6;
  const boomChordMembers: BeamSegment3D[] = [];
  const boomLattice: BeamSegment3D[] = [];
  const boomCrossMembers: BeamSegment3D[] = [];
  const panelCount = 13;
  const panelLength = (boomEndZ - boomStartZ) / panelCount;
  for (const xSide of [-1, 1]) {
    const x = xSide * boomHalfWidth;
    boomChordMembers.push(
      { start: [x, boomBottomY, boomStartZ], end: [x, boomBottomY, boomEndZ] },
      { start: [x, boomTopY, boomStartZ], end: [x, boomTopY, boomEndZ] },
    );
    for (let panel = 0; panel <= panelCount; panel += 1) {
      const z = boomStartZ + panel * panelLength;
      boomLattice.push({ start: [x, boomBottomY, z], end: [x, boomTopY, z] });
      if (panel < panelCount) {
        const nextZ = z + panelLength;
        boomLattice.push(
          { start: [x, boomBottomY, z], end: [x, boomTopY, nextZ] },
          { start: [x, boomTopY, z], end: [x, boomBottomY, nextZ] },
        );
      }
      boomCrossMembers.push(
        { start: [-boomHalfWidth, boomBottomY, z], end: [boomHalfWidth, boomBottomY, z] },
        { start: [-boomHalfWidth, boomTopY, z], end: [boomHalfWidth, boomTopY, z] },
      );
    }
  }
  addBoxBeamBatch(THREE, group, boomChordMembers, [0.75, 0.75], frameMaterial);
  addBoxBeamBatch(THREE, group, boomLattice, [0.36, 0.36], braceMaterial);
  addBoxBeamBatch(THREE, group, boomCrossMembers, [0.32, 0.32], frameMaterial);
  const boomHinge = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 12, 12), darkMaterial);
  boomHinge.rotation.z = Math.PI / 2;
  boomHinge.position.set(0, (boomBottomY + boomTopY) / 2, boomStartZ);
  group.add(boomHinge);

  const towerApex: [number, number, number] = [0, 51, -9];
  const towerMembers: BeamSegment3D[] = [
    { start: [-6.2, topY, -9], end: towerApex },
    { start: [6.2, topY, -9], end: towerApex },
    { start: [0, 32, -9], end: towerApex },
    { start: [-6.2, 39, -9], end: [6.2, 39, -9] },
  ];
  addBoxBeamBatch(THREE, group, towerMembers, [0.62, 0.62], frameMaterial);
  const stayRods: BeamSegment3D[] = [];
  for (const xSide of [-1, 1]) {
    stayRods.push(
      { start: towerApex, end: [xSide * boomHalfWidth, boomTopY, boomEndZ] },
      { start: towerApex, end: [xSide * boomHalfWidth, boomTopY, -31] },
    );
  }
  addRoundBeamBatch(THREE, group, stayRods, 0.16, darkMaterial);

  const trolleyZ = 26;
  const trolleyY = boomBottomY - 0.95;
  addBox(THREE, group, [7.0, 1.5, 5.5], [0, trolleyY, trolleyZ], darkMaterial);
  addBox(THREE, group, [2.2, 2.0, 2.0], [3.7, trolleyY - 0.5, trolleyZ], paleMaterial);
  addBox(THREE, group, [1.72, 0.7, 0.08], [3.7, trolleyY - 0.42, trolleyZ + 1.04], glassMaterial);
  addBox(THREE, group, [1.72, 0.7, 0.08], [3.7, trolleyY - 0.42, trolleyZ - 1.04], glassMaterial);
  const trolleyWheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.8, 10), darkMaterial, 4);
  const trolleyPose = new THREE.Object3D();
  let trolleyWheelIndex = 0;
  for (const x of [-3.45, 3.45]) {
    for (const z of [trolleyZ - 1.9, trolleyZ + 1.9]) {
      trolleyPose.position.set(x, boomBottomY + 0.24, z);
      trolleyPose.rotation.z = Math.PI / 2;
      trolleyPose.updateMatrix();
      trolleyWheels.setMatrixAt(trolleyWheelIndex, trolleyPose.matrix);
      trolleyWheelIndex += 1;
    }
  }
  trolleyWheels.instanceMatrix.needsUpdate = true;
  group.add(trolleyWheels);
  const hoistCables: BeamSegment3D[] = [];
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      hoistCables.push({
        start: [xSide * 4.7, trolleyY - 0.2, trolleyZ + zSide * 1.8],
        end: [xSide * 4.7, 20.56, trolleyZ + zSide * 1.2],
      });
    }
  }
  addRoundBeamBatch(THREE, group, hoistCables, 0.13, darkMaterial);
  addBox(THREE, group, [12.2, 0.52, 2.6], [0, 20.3, trolleyZ], spreaderMaterial);
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      addBox(THREE, group, [0.65, 0.72, 0.62], [xSide * 5.75, 20.2, trolleyZ + zSide * 1.12], darkMaterial);
    }
  }

  scene.add(group);
}

function addBollardLabel(
  THREE: ThreeModule,
  scene: import("three").Scene,
  id: string,
  position: number,
  total: number,
  color: string,
  estimated: boolean,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 40;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = color;
  context.fillRect(2, 2, 92, 36);
  context.strokeStyle = "rgba(15, 23, 42, 0.8)";
  context.lineWidth = 3;
  context.strokeRect(2, 2, 92, 36);
  context.fillStyle = "#ffffff";
  context.font = `800 ${id.length > 4 ? 17 : id.length === 4 ? 21 : 27}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(id, 48, 21, 86);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: estimated ? 0.72 : 1,
    depthWrite: false,
  });
  const label = new THREE.Sprite(material);
  label.position.set(stationToX(position, total), QUAY_TOP_Y + 3.0, -0.7);
  label.scale.set(Math.max(6, Math.min(12, id.length * 2.1)), 3, 1);
  label.userData.bollardId = id;
  scene.add(label);
}

function addMooringLines(THREE: ThreeModule, scene: import("three").Scene, scenario: Scenario, total: number) {
  const bollards = new Map(bollardDisplayPositions(scenario.bollards, total).map((bollard) => [bollard.id, bollard]));
  const cableMaterial = new THREE.MeshStandardMaterial({
    color: "#f1cc19",
    roughness: 0.72,
    metalness: 0.02,
    emissive: "#4a3d00",
    emissiveIntensity: 0.14,
  });

  for (const vessel of scenario.vessels) {
    const beam = Math.max(1, vessel.beam);
    const nearSideZ = BERTH_GAP + beam * 0.01 + 0.1;
    const draft = Number.isFinite(vessel.draft) ? Math.max(1, Math.min(18, vessel.draft)) : 10;
    const deckHeight = Math.max(6, Math.min(9, draft * 0.6));
    for (const line of vessel.mooringLines) {
      if (!line.bollardId) continue;
      const bollard = bollards.get(line.bollardId);
      if (!bollard) continue;
      const offset = normalizeMooringOffset(line.type, vessel.loa, line.shipOffset ?? defaultMooringOffset(line.type, vessel.loa));
      const shipStation = vessel.position + berthwiseOffsetFromStern(vessel.loa, vessel.berthingSide, offset);
      const shipX = stationToX(shipStation, total);
      const quayX = stationToX(bollard.position, total);
      const start = new THREE.Vector3(shipX, deckHeight + 0.65, nearSideZ);
      const end = new THREE.Vector3(quayX, QUAY_TOP_Y + 1.15, QUAY_EDGE_Z - 0.6);
      const span = start.distanceTo(end);
      const slack = Math.min(1.25, Math.max(0.35, span * 0.018));
      const control = start.clone().lerp(end, 0.5);
      control.y -= slack * 2;
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.18, 5, false), cableMaterial);
      rope.userData.lineType = line.type;
      rope.userData.vesselId = vessel.id;
      scene.add(rope);
    }
  }
}

function addShoreManifolds(THREE: ThreeModule, scene: import("three").Scene, scenario: Scenario, total: number) {
  const b297 = scenario.bollards.find((b) => b.id === "297")?.position ?? 276.9;
  const b296 = scenario.bollards.find((b) => b.id === "296")?.position ?? 306.9;
  const b294 = scenario.bollards.find((b) => b.id === "294")?.position ?? 362.9;

  const manifold297_296_M = (b297 + b296) / 2; // ~291.9m
  const manifold294_M = b294; // ~362.9m

  const concreteMat = new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.85 });
  const pipeMatRed = new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.45, metalness: 0.6 });
  const pipeMatBlue = new THREE.MeshStandardMaterial({ color: "#0284c7", roughness: 0.45, metalness: 0.6 });
  const valveMat = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.35, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.6 });

  const manifolds = [
    { name: "MANIFOLD 297–296", station: manifold297_296_M, z: -3.4, isLand: false },
    { name: "MANIFOLD 294", station: manifold294_M, z: -3.4, isLand: false },
    { name: "MANIFOLD LADO TERRA", station: manifold297_296_M, z: -17.5, isLand: true },
  ];

  for (const mf of manifolds) {
    const group = new THREE.Group();
    const xPos = stationToX(mf.station, total);
    group.position.set(xPos, QUAY_TOP_Y, mf.z);

    const length = mf.isLand ? 13 : 9.0;
    const depth = mf.isLand ? 6.0 : 4.0;
    // 1. Base de concreto elevada
    addBox(THREE, group, [length, 0.45, depth], [0, 0.22, 0], concreteMat);

    // 2. Barreira amarela de proteção
    const railMat = new THREE.MeshStandardMaterial({ color: "#eab308", roughness: 0.5 });
    for (const side of [-1, 1]) {
      addBox(THREE, group, [length * 0.95, 0.14, 0.14], [0, 0.85, side * (depth * 0.46)], railMat);
      for (const px of [-length * 0.45, 0, length * 0.45]) {
        addBox(THREE, group, [0.14, 0.75, 0.14], [px, 0.42, side * (depth * 0.46)], railMat);
      }
    }

    // 3. Tubulações horizontais coletoras
    const pipeCount = mf.isLand ? 3 : 2;
    for (let p = 0; p < pipeCount; p += 1) {
      const pz = (p - (pipeCount - 1) / 2) * 1.25;
      const pipeGeo = new THREE.CylinderGeometry(0.26, 0.26, length * 0.88, 10);
      const pipeMesh = new THREE.Mesh(pipeGeo, p === 1 && mf.isLand ? pipeMatBlue : pipeMatRed);
      pipeMesh.rotation.z = Math.PI / 2;
      pipeMesh.position.set(0, 0.65 + p * 0.38, pz);
      group.add(pipeMesh);

      // Flanges e válvulas verticais
      for (const vx of [-length * 0.3, 0, length * 0.3]) {
        const valveStem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.85, 8), darkMat);
        valveStem.position.set(vx, 1.05 + p * 0.38, pz);
        group.add(valveStem);

        const handwheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 14), valveMat);
        handwheel.rotation.x = Math.PI / 2;
        handwheel.position.set(vx, 1.48 + p * 0.38, pz);
        group.add(handwheel);
      }
    }

    // 4. Placa identificadora com Sprite 3D nítido
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 52;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#b91c1c";
      context.fillRect(2, 2, 188, 48);
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      context.strokeRect(4, 4, 184, 44);
      context.fillStyle = "#ffffff";
      context.font = "bold 18px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(mf.name, 96, 26, 180);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 3.2, 0);
      sprite.scale.set(mf.isLand ? 15 : 12, 3.2, 1);
      group.add(sprite);
    }

    scene.add(group);
  }
}

function addCompanyBoundaryFence(
  THREE: ThreeModule,
  scene: import("three").Scene,
  scenario: Scenario,
  total: number,
) {
  const b278 = scenario.bollards.find((b) => b.id === "278")?.position ?? 796.9;
  const b277 = scenario.bollards.find((b) => b.id === "277")?.position ?? 823.4;
  const fenceM = (b278 + b277) / 2; // ~810.15 m (ponto médio exato entre cabeços 278 e 277)
  const fenceX = stationToX(fenceM, total);

  const group = new THREE.Group();
  group.position.x = fenceX;

  // 1. Piso acinzentado diferenciado da empresa vizinha (estação > fenceM até o fim do cais)
  const neighborQuayLength = Math.max(0, total - fenceM);
  if (neighborQuayLength > 0.5) {
    const neighborCenterX = stationToX(fenceM + neighborQuayLength / 2, total);
    const neighborMat = new THREE.MeshStandardMaterial({
      color: "#5a6870",
      roughness: 0.92,
      metalness: 0.05,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const neighborDeck = new THREE.Mesh(
      new THREE.PlaneGeometry(neighborQuayLength, 30),
      neighborMat,
    );
    neighborDeck.rotation.x = -Math.PI / 2;
    neighborDeck.position.set(neighborCenterX, QUAY_TOP_Y + 0.015, -15);
    scene.add(neighborDeck);
  }

  // 2. Faixa zebrada amarela e preta / demarcação de segurança no solo ao longo da divisa
  const stripeCanvas = document.createElement("canvas");
  stripeCanvas.width = 128;
  stripeCanvas.height = 128;
  const sCtx = stripeCanvas.getContext("2d");
  if (sCtx) {
    sCtx.fillStyle = "#eab308"; // Amarelo de segurança
    sCtx.fillRect(0, 0, 128, 128);
    sCtx.fillStyle = "#1e293b"; // Listras pretas diagonais
    for (let i = -128; i < 256; i += 32) {
      sCtx.beginPath();
      sCtx.moveTo(i, 0);
      sCtx.lineTo(i + 16, 0);
      sCtx.lineTo(i + 16 + 128, 128);
      sCtx.lineTo(i + 128, 128);
      sCtx.closePath();
      sCtx.fill();
    }
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(1, 14);
  const stripeMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const groundStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 29.2), stripeMat);
  groundStripe.rotation.x = -Math.PI / 2;
  groundStripe.position.set(0, QUAY_TOP_Y + 0.02, -15);
  group.add(groundStripe);

  // 3. Materiais estruturais da cerca
  const steelPostMat = new THREE.MeshStandardMaterial({
    color: "#334155",
    roughness: 0.35,
    metalness: 0.75,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: "#475569",
    roughness: 0.45,
    metalness: 0.65,
  });
  const concreteBaseMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.9,
  });

  // Textura do alambrado / malha losangular semi-transparente
  const meshCanvas = document.createElement("canvas");
  meshCanvas.width = 64;
  meshCanvas.height = 64;
  const mCtx = meshCanvas.getContext("2d");
  if (mCtx) {
    mCtx.clearRect(0, 0, 64, 64);
    mCtx.strokeStyle = "#94a3b8";
    mCtx.lineWidth = 3.5;
    mCtx.beginPath();
    mCtx.moveTo(32, 0); mCtx.lineTo(64, 32); mCtx.lineTo(32, 64); mCtx.lineTo(0, 32); mCtx.closePath();
    mCtx.stroke();
    mCtx.beginPath();
    mCtx.moveTo(0, 0); mCtx.lineTo(32, 32); mCtx.lineTo(64, 0);
    mCtx.moveTo(0, 64); mCtx.lineTo(32, 32); mCtx.lineTo(64, 64);
    mCtx.stroke();
  }
  const meshTex = new THREE.CanvasTexture(meshCanvas);
  meshTex.wrapS = THREE.RepeatWrapping;
  meshTex.wrapT = THREE.RepeatWrapping;
  meshTex.repeat.set(24, 4);
  const fenceMeshMat = new THREE.MeshStandardMaterial({
    map: meshTex,
    transparent: true,
    opacity: 0.82,
    roughness: 0.5,
    metalness: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Painel de tela contínuo da cerca (altura 2.4m, de z = -0.5 até z = -29.5)
  const fenceLength = 29.0;
  const fenceCenterZ = -15.0;
  const fenceHeight = 2.4;
  const fenceMeshPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(fenceLength, fenceHeight),
    fenceMeshMat,
  );
  fenceMeshPlane.rotation.y = Math.PI / 2;
  fenceMeshPlane.position.set(0, QUAY_TOP_Y + fenceHeight / 2 + 0.15, fenceCenterZ);
  group.add(fenceMeshPlane);

  // 4. Postes verticais espaçados ao longo do cais
  const postSpacing = 2.4;
  const postCount = Math.floor(fenceLength / postSpacing) + 1;
  const startZ = -0.5;

  for (let i = 0; i < postCount; i += 1) {
    const postZ = startZ - i * postSpacing;
    if (postZ < -29.6) continue;

    // Sapata / base de concreto no piso
    addBox(THREE, group, [0.36, 0.22, 0.36], [0, QUAY_TOP_Y + 0.11, postZ], concreteBaseMat);

    // Pilar metálico vertical (2.65m de altura)
    const postGeo = new THREE.CylinderGeometry(0.065, 0.065, 2.65, 8);
    const postMesh = new THREE.Mesh(postGeo, steelPostMat);
    postMesh.position.set(0, QUAY_TOP_Y + 1.35, postZ);
    group.add(postMesh);

    // Braço inclinado superior a 45° (suporte da concertina de segurança)
    const armGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6);
    const armMesh = new THREE.Mesh(armGeo, steelPostMat);
    armMesh.rotation.z = Math.PI / 4;
    armMesh.position.set(-0.18, QUAY_TOP_Y + 2.8, postZ);
    group.add(armMesh);
  }

  // 5. Trilhos horizontais de reforço (superior, intermediário e inferior)
  for (const railY of [QUAY_TOP_Y + 0.18, QUAY_TOP_Y + 1.35, QUAY_TOP_Y + 2.55]) {
    const railGeo = new THREE.CylinderGeometry(0.04, 0.04, fenceLength, 8);
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.rotation.x = Math.PI / 2;
    railMesh.position.set(0, railY, fenceCenterZ);
    group.add(railMesh);
  }

  // 6. Concertina / arame farpado no topo dos braços inclinados
  const razorWireMat = new THREE.MeshStandardMaterial({
    color: "#94a3b8",
    roughness: 0.3,
    metalness: 0.85,
  });
  const razorLineGeo = new THREE.CylinderGeometry(0.025, 0.025, fenceLength, 6);
  const razorLine = new THREE.Mesh(razorLineGeo, razorWireMat);
  razorLine.rotation.x = Math.PI / 2;
  razorLine.position.set(-0.35, QUAY_TOP_Y + 2.95, fenceCenterZ);
  group.add(razorLine);

  for (let cz = startZ; cz >= -29.5; cz -= 0.75) {
    const ringGeo = new THREE.TorusGeometry(0.24, 0.018, 6, 12);
    const ringMesh = new THREE.Mesh(ringGeo, razorWireMat);
    ringMesh.rotation.y = Math.PI / 2;
    ringMesh.position.set(-0.35, QUAY_TOP_Y + 2.95, cz);
    group.add(ringMesh);
  }

  // 7. Placas físicas montadas na grade (altura dos olhos, legíveis em ambos os lados)
  for (const signZ of [-6.0, -18.0]) {
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 256;
    signCanvas.height = 72;
    const sCtx2 = signCanvas.getContext("2d");
    if (sCtx2) {
      sCtx2.fillStyle = "#991b1b"; // Vermelho institucional da Cerca
      sCtx2.fillRect(2, 2, 252, 68);
      sCtx2.strokeStyle = "#ffffff";
      sCtx2.lineWidth = 4;
      sCtx2.strokeRect(5, 5, 246, 62);
      sCtx2.fillStyle = "#ffffff";
      sCtx2.font = "bold 20px Arial, sans-serif";
      sCtx2.textAlign = "center";
      sCtx2.textBaseline = "middle";
      sCtx2.fillText("CERCA · DIVISA ENTRE EMPRESAS", 128, 26, 240);
      sCtx2.font = "bold 13px Arial, sans-serif";
      sCtx2.fillStyle = "#fecaca";
      sCtx2.fillText("LIMITE DE CONCESSÃO (CAB. 278 – 277)", 128, 50, 240);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), signMat);
    signBoard.rotation.y = Math.PI / 2;
    signBoard.position.set(0.04, QUAY_TOP_Y + 1.85, signZ);
    group.add(signBoard);

    const signBoardBack = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), signMat);
    signBoardBack.rotation.y = -Math.PI / 2;
    signBoardBack.position.set(-0.04, QUAY_TOP_Y + 1.85, signZ);
    group.add(signBoardBack);
  }

  // 8. Marcador / Sprite flutuante de identificação (visível e nítido de qualquer ângulo 3D)
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const lCtx = labelCanvas.getContext("2d");
  if (lCtx) {
    lCtx.fillStyle = "#991b1b";
    lCtx.fillRect(3, 3, 250, 58);
    lCtx.strokeStyle = "#ffffff";
    lCtx.lineWidth = 3.5;
    lCtx.strokeRect(5, 5, 246, 54);
    lCtx.fillStyle = "#ffffff";
    lCtx.font = "bold 21px Arial, sans-serif";
    lCtx.textAlign = "center";
    lCtx.textBaseline = "middle";
    lCtx.fillText("CERCA · DIVISA DE EMPRESA", 128, 24, 240);
    lCtx.font = "bold 13px Arial, sans-serif";
    lCtx.fillStyle = "#fed7aa";
    lCtx.fillText(`CAB. 278 ⮂ 277 · ${fenceM.toFixed(1).replace(".", ",")} m`, 128, 45, 240);
  }
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.generateMipmaps = false;
  const spriteMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, QUAY_TOP_Y + 5.0, -15.0);
  sprite.scale.set(13.0, 3.2, 1);
  group.add(sprite);

  scene.add(group);
}

function buildScene(THREE: ThreeModule, scene: import("three").Scene, scenario: Scenario) {
  const total = Math.max(1, totalQuayLength(scenario.segments));
  const segments = segmentOffsets(scenario.segments);
  const segmentColors = ["#d9c8a9", "#d9cfbd", "#bccbd0", "#c7d7d7"];
  const waterMaterial = new THREE.MeshStandardMaterial({ color: "#8fc4cd", roughness: 0.34, metalness: 0.04 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(total + 180, 430), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, 185);
  scene.add(water);

  for (const [index, segment] of segments.entries()) {
    const length = Math.max(0.5, segment.length);
    const quayMaterial = new THREE.MeshStandardMaterial({ color: segmentColors[index % segmentColors.length], roughness: 0.92 });
    const quay = new THREE.Mesh(new THREE.BoxGeometry(length, 8, 30), quayMaterial);
    quay.position.set(stationToX(segment.start + length / 2, total), 0, -15);
    scene.add(quay);
  }

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: "#546c74", roughness: 0.8 });
  addBox(THREE, scene, [total, 0.5, 0.9], [0, 3.8, -0.35], edgeMaterial);

  const railMaterial = new THREE.MeshStandardMaterial({ color: "#46545a", roughness: 0.54, metalness: 0.48 });
  for (const z of [-22, -20, -2.2, -0.2]) {
    addBox(THREE, scene, [total, 0.24, 0.42], [0, QUAY_TOP_Y + 0.12, z], railMaterial);
  }

  const bollardDisplays = bollardDisplayPositions(scenario.bollards, total);
  if (bollardDisplays.length) {
    const bollardGeo = new THREE.CylinderGeometry(0.55, 0.82, 1.55, 8);
    const bollardMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.72, metalness: 0.22 });
    const posts = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardDisplays.length);
    const pose = new THREE.Object3D();
    bollardDisplays.forEach((display, index) => {
      pose.position.set(stationToX(display.position, total), QUAY_TOP_Y + 0.7, -0.6);
      pose.scale.setScalar(display.estimated ? 0.72 : 1);
      pose.updateMatrix();
      posts.setMatrixAt(index, pose.matrix);
      const type = scenario.bollards.find((bollard) => bollard.id === display.id)?.type ?? display.type ?? "duplo";
      const typeColor = BOLLARD_TYPES[type]?.color ?? "#3a7ebf";
      posts.setColorAt(index, new THREE.Color(typeColor));
      addBollardLabel(THREE, scene, display.id, display.position, total, typeColor, display.estimated);
    });
    posts.instanceMatrix.needsUpdate = true;
    if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
    scene.add(posts);
  }

  const vesselRefs = scenario.vessels.map((vessel) => ({ vessel, ...addVessel(THREE, scene, vessel, total) }));
  addMooringLines(THREE, scene, scenario, total);
  addShoreManifolds(THREE, scene, scenario, total);
  addCompanyBoundaryFence(THREE, scene, scenario, total);

  if (scenario.showPortainers !== false) {
    for (const portainer of scenario.portainers ?? DEFAULT_PORTAINERS) addPortainer(THREE, scene, portainer, total);
  }

  const gangwayMaterial = new THREE.MeshStandardMaterial({ color: "#7c72aa", roughness: 0.8 });
  for (const { vessel, deckHeight } of vesselRefs) {
    const offset = Math.max(0, Math.min(vessel.loa, vessel.gangwayOffset));
    const gangwayStation = vessel.position + berthwiseOffsetFromStern(vessel.loa, vessel.berthingSide, offset);
    const gangwayX = stationToX(gangwayStation, total);
    const nearSideZ = BERTH_GAP + Math.max(1, vessel.beam) * 0.01 + 0.1;
    const startZ = QUAY_EDGE_Z - 0.7;
    const rampLength = nearSideZ - startZ;
    const deckTop = deckHeight + 0.45;
    const ramp = addBox(THREE, scene, [2.2, 0.55, rampLength], [gangwayX, (QUAY_TOP_Y + deckTop) / 2, (nearSideZ + startZ) / 2], gangwayMaterial);
    ramp.rotation.x = -Math.atan2(deckTop - QUAY_TOP_Y, rampLength);
  }

  return { total, bollardCount: bollardDisplays.length };
}

function disposeScene(scene: import("three").Scene) {
  const geometries = new Set<import("three").BufferGeometry>();
  const materials = new Set<import("three").Material>();
  const textures = new Set<import("three").Texture>();
  scene.traverse((object) => {
    const renderable = object as import("three").Mesh;
    const sprite = object as import("three").Sprite;
    if (!renderable.isMesh && !(object as import("three").InstancedMesh).isInstancedMesh && !(object as import("three").Line).isLine && !sprite.isSprite) return;
    const resource = object as import("three").Mesh;
    if (resource.geometry) geometries.add(resource.geometry);
    const material = resource.material;
    const addMaterial = (entry: import("three").Material) => {
      materials.add(entry);
      const texture = (entry as import("three").SpriteMaterial).map;
      if (texture?.isTexture) textures.add(texture);
    };
    if (Array.isArray(material)) material.forEach(addMaterial);
    else if (material) addMaterial(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export default function Berth3DViewer({ scenario }: Berth3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetCameraRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const total = totalQuayLength(scenario.segments);
  const assignedLineCount = scenario.vessels.reduce(
    (count, vessel) => count + vessel.mooringLines.filter((line) => Boolean(line.bollardId)).length,
    0,
  );
  const assignedLines = scenario.vessels.flatMap((vessel) =>
    vessel.mooringLines.filter((line) => Boolean(line.bollardId)).map((line) => ({ vessel, line })),
  );
  const estimatedBollards = scenario.bollards.filter((bollard) => bollard.position === null).length;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let threeModule: ThreeModule | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let scene: import("three").Scene | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let contextLostHandler: ((event: Event) => void) | null = null;

    setStatus("loading");
    setError("");

    void Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")])
      .then(([THREE, orbitModule]) => {
        if (cancelled || !host) return;
        threeModule = THREE;
        try {
          scene = new THREE.Scene();
          scene.background = new THREE.Color("#e6f0f3");
          scene.add(new THREE.HemisphereLight("#ffffff", "#647680", 2.0));
          const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
          keyLight.position.set(-80, 150, 100);
          scene.add(keyLight);

          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power", alpha: false });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          renderer.setSize(width, height, false);
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.domElement.setAttribute("aria-label", "Modelo 3D esquemático da atracação");
          host.appendChild(renderer.domElement);

          const model = buildScene(THREE, scene, scenario);
          const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, model.total * 7 + 400);
          const verticalFov = THREE.MathUtils.degToRad(camera.fov);
          const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
          const distanceToFitQuay = model.total / (2 * Math.tan(horizontalFov / 2));
          const distance = Math.max(model.total * 0.35, distanceToFitQuay * 0.70);
          camera.position.set(0, distance * 0.28, distance * 0.88);
          camera.lookAt(0, 16, 12);

          controls = new orbitModule.OrbitControls(camera, renderer.domElement);
          controls.target.set(0, 16, 12);
          controls.enableDamping = false;
          controls.enablePan = true;
          controls.enableZoom = true;
          controls.screenSpacePanning = true;
          controls.minDistance = 30;
          controls.maxDistance = model.total * 6 + 300;
          controls.update();

          const render = () => {
            if (!cancelled && renderer && scene) renderer.render(scene, camera);
          };
          const defaultCameraPosition = camera.position.clone();
          const defaultCameraTarget = controls.target.clone();
          resetCameraRef.current = () => {
            camera.position.copy(defaultCameraPosition);
            controls?.target.copy(defaultCameraTarget);
            controls?.update();
            render();
          };
          controls.addEventListener("change", render);
          resizeObserver = new ResizeObserver(() => {
            if (!renderer || !host) return;
            const nextWidth = Math.max(1, host.clientWidth);
            const nextHeight = Math.max(1, host.clientHeight);
            camera.aspect = nextWidth / nextHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(nextWidth, nextHeight, false);
            render();
          });
          resizeObserver.observe(host);
          contextLostHandler = (event: Event) => {
            event.preventDefault();
            if (!cancelled) {
              setError("A aceleração 3D do navegador foi interrompida. Feche esta janela e continue usando a vista 2D.");
              setStatus("error");
            }
          };
          renderer.domElement.addEventListener("webglcontextlost", contextLostHandler, { once: true });
          render();
          if (!cancelled) setStatus("ready");
        } catch (cause) {
          if (cancelled) return;
          if (scene) {
            disposeScene(scene);
            scene = null;
          }
          controls?.dispose();
          controls = null;
          renderer?.dispose();
          renderer?.domElement.remove();
          renderer = null;
          setError(
            cause instanceof Error && /webgl|context|renderer/i.test(cause.message)
              ? "Este navegador ou dispositivo não conseguiu iniciar WebGL 2. A visualização 2D continua disponível."
              : "Não foi possível montar a cena 3D neste dispositivo. A visualização 2D continua disponível."
          );
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível carregar o módulo 3D. A visualização 2D continua disponível.");
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      resetCameraRef.current = () => undefined;
      resizeObserver?.disconnect();
      controls?.dispose();
      if (renderer && contextLostHandler) renderer.domElement.removeEventListener("webglcontextlost", contextLostHandler);
      if (scene && threeModule) disposeScene(scene);
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [scenario]);

  return (
    <div className="berth-3d-viewer">
      <div className="berth-3d-summary" aria-label="Resumo do cenário 3D">
        <span><strong>{scenario.vessels.length}</strong> navio(s)</span>
        <span><strong>{scenario.bollards.length}</strong> cabeços</span>
        <span><strong>{assignedLineCount}</strong> cabo(s) conectado(s)</span>
        <button type="button" className="berth-3d-reset-view" onClick={() => resetCameraRef.current()} aria-label="Restaurar o enquadramento inicial da câmera">
          Restaurar enquadramento
        </button>
        <span className="berth-3d-hint">Arraste para girar · roda do mouse para zoom · botão direito para mover</span>
      </div>
      <div className="berth-3d-vessel-key" aria-label="Navios e direção da proa">
        {scenario.vessels.map((vessel) => (
          <span key={vessel.id}>
            <i style={{ background: VESSEL_COLORS[vessel.color]?.fill ?? "#3f779b" }} />
            {vessel.name || "Navio sem nome"} · proa {vessel.berthingSide === "bombordo" ? "←" : "→"}
          </span>
        ))}
        <span><i className="berth-3d-rope-key" /> Cabos amarelos</span>
        <span><i className="berth-3d-bollard-key" /> Cabeços numerados</span>
        <span><i style={{ display: "inline-block", width: "9px", height: "9px", background: "#b91c1c", borderRadius: "2px" }} /> Manifolds (297–296 / 294 / Terra)</span>
        <span><i style={{ display: "inline-block", width: "9px", height: "9px", background: "#991b1b", borderRadius: "2px" }} /> Cerca / Divisa (278–277)</span>
      </div>
      {assignedLines.length > 0 && (
        <details className="berth-3d-connections">
          <summary>Ver cabeços usados nas amarrações ({assignedLines.length})</summary>
          <div className="berth-3d-connections-list">
            {assignedLines.map(({ vessel, line }) => (
              <span key={`${vessel.id}-${line.id}`}>
                {vessel.name || "Navio"} · {MOORING_LINE_LABELS[line.type]} → cabeço {line.bollardId}
              </span>
            ))}
          </div>
        </details>
      )}
      <div className="berth-3d-canvas-wrap" ref={hostRef}>
        {status === "loading" && <div className="berth-3d-state">Carregando a vista 3D…</div>}
        {status === "error" && <div className="berth-3d-state berth-3d-error" role="alert">{error}</div>}
        {status === "ready" && scenario.vessels.length === 0 && <div className="berth-3d-empty">Adicione um navio para compor este cenário.</div>}
      </div>
      <p className="berth-3d-caveat">
        Modelo visual esquemático — altura e perfil dos navios são ilustrativos, pois não há cadastro de altura total. Não destinado à validação de segurança ou amarração. {estimatedBollards > 0
          ? `${estimatedBollards} posição(ões) de cabeço sem levantamento são ilustrativas.`
          : `Cais: ${total.toLocaleString("pt-BR")} m.`}
      </p>
    </div>
  );
}
