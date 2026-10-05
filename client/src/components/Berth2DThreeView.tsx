import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sun,
  Moon,
  Camera,
  Layers,
  Download,
  Share2,
  Info,
  Sliders,
  Check,
} from "lucide-react";
import { Scenario, Vessel, Portainer, Bollard } from "@/lib/berth-model";

interface Berth2DThreeViewProps {
  scenario: Scenario;
  selectedVesselId: string | null;
  onSelectVessel?: (id: string) => void;
  exportTriggerRef?: React.MutableRefObject<((format?: "jpeg" | "png") => Promise<string | null>) | null>;
}

export default function Berth2DThreeView({
  scenario,
  selectedVesselId,
  onSelectVessel,
  exportTriggerRef,
}: Berth2DThreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"ortho" | "iso">("ortho");
  const [isNight, setIsNight] = useState(false);
  const [showPortainers, setShowPortainers] = useState(true);
  const [showMooringLines, setShowMooringLines] = useState(true);
  const [showBollardLabels, setShowBollardLabels] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>(null);

  const totalQuay = scenario.segments.reduce((acc, s) => acc + s.length, 0) || 900;
  const quayHeight = 12;

  // Zoom and Pan state
  const panOffset = useRef<{ x: number; y: number }>({ x: totalQuay / 2, y: 35 });
  const isDragging = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Expor função de captura em alta resolução para download externo
  useEffect(() => {
    if (exportTriggerRef) {
      exportTriggerRef.current = async (format = "jpeg") => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return null;
        
        // Renderiza no buffer atual
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const quality = format === "png" ? undefined : 0.98;
        return rendererRef.current.domElement.toDataURL(mime, quality);
      };
    }
  }, [exportTriggerRef]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 700;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isNight ? 0x07111e : 0xeef4f7);

    // 2. Camera Setup (Orthographic for precise engineering 2D plan, or Perspective for 2.5D)
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    const aspect = width / height;

    if (viewMode === "ortho") {
      const frustumSize = (totalQuay * 0.45) / zoomLevel;
      camera = new THREE.OrthographicCamera(
        (-frustumSize * aspect) / 2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        -frustumSize / 2,
        1,
        2500
      );
      // Top-Down: Olhando diretamente de cima para baixo (Planta Técnica 2D)
      camera.position.set(panOffset.current.x, 600, panOffset.current.y);
      camera.lookAt(panOffset.current.x, 0, panOffset.current.y);
      camera.rotation.z = 0;
    } else {
      camera = new THREE.PerspectiveCamera(38, aspect, 1, 3000);
      const dist = (800 / zoomLevel);
      camera.position.set(panOffset.current.x, dist * 0.65, panOffset.current.y + dist * 0.85);
      camera.lookAt(panOffset.current.x, 0, panOffset.current.y);
    }
    cameraRef.current = camera;

    // 3. Renderer with High-DPI support
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Lighting (Engineering Daylight or Terminal Night Floodlights)
    const ambientLight = new THREE.AmbientLight(isNight ? 0x223355 : 0xffffff, isNight ? 0.75 : 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(isNight ? 0x5588cc : 0xfffcf5, isNight ? 0.6 : 1.25);
    sunLight.position.set(totalQuay * 0.5, 350, -120);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 1000;
    const d = totalQuay * 0.6;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // 5. Água do Porto (Water Surface)
    const waterGeo = new THREE.PlaneGeometry(totalQuay + 600, 700);
    const waterMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x081c2f : 0x185a75,
      roughness: 0.18,
      metalness: 0.55,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(totalQuay / 2, -0.2, 190);
    water.receiveShadow = true;
    scene.add(water);

    // 6. Estrutura do Cais (Concrete Pier Deck & Features)
    const quayWidth = 75; // largura de terra até a borda
    const quayGeo = new THREE.BoxGeometry(totalQuay + 40, quayHeight, quayWidth);
    const quayMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x242e38 : 0xd1d9de, // concreto técnico portuário
      roughness: 0.85,
    });
    const quay = new THREE.Mesh(quayGeo, quayMat);
    quay.position.set(totalQuay / 2, -quayHeight / 2, -quayWidth / 2);
    quay.receiveShadow = true;
    quay.castShadow = true;
    scene.add(quay);

    // Guia amarela de segurança da borda do cais (Safety Edge Curb)
    const curbGeo = new THREE.BoxGeometry(totalQuay + 40, 0.5, 1.4);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(totalQuay / 2, 0.25, -0.7);
    scene.add(curb);

    // Trilhos dos Portêineres no Cais (Crane Rails: Waterside & Landside Rails ~20m apart)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    // Trilho da frente (Waterside Rail - 3.5m do cais)
    const railFrontGeo = new THREE.BoxGeometry(totalQuay + 40, 0.15, 0.45);
    const railFront = new THREE.Mesh(railFrontGeo, railMat);
    railFront.position.set(totalQuay / 2, 0.1, -3.5);
    scene.add(railFront);

    // Trilho de trás (Landside Rail - 23.5m do cais)
    const railBackGeo = new THREE.BoxGeometry(totalQuay + 40, 0.15, 0.45);
    const railBack = new THREE.Mesh(railBackGeo, railMat);
    railBack.position.set(totalQuay / 2, 0.1, -23.5);
    scene.add(railBack);

    // Dormentes e piso entre os trilhos
    const trackBedGeo = new THREE.PlaneGeometry(totalQuay + 40, 20.4);
    const trackBedMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x1e2630 : 0xbdc7cc,
      roughness: 0.95,
    });
    const trackBed = new THREE.Mesh(trackBedGeo, trackBedMat);
    trackBed.rotation.x = -Math.PI / 2;
    trackBed.position.set(totalQuay / 2, 0.05, -13.5);
    trackBed.receiveShadow = true;
    scene.add(trackBed);

    // Divisões dos trechos de cais e réguas métricas a cada 50 metros
    let currentX = 0;
    scenario.segments.forEach((seg, idx) => {
      // Linha divisória de segmento
      if (idx > 0) {
        const segLineGeo = new THREE.BoxGeometry(0.8, 0.2, quayWidth);
        const segLineMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
        const segLine = new THREE.Mesh(segLineGeo, segLineMat);
        segLine.position.set(currentX, 0.15, -quayWidth / 2);
        scene.add(segLine);
      }
      currentX += seg.length;
    });

    for (let m = 0; m <= totalQuay; m += 25) {
      const isMajor = m % 100 === 0;
      const markGeo = new THREE.BoxGeometry(0.4, 0.15, isMajor ? 6.5 : 3.5);
      const markMat = new THREE.MeshBasicMaterial({ color: isMajor ? 0xffffff : 0x94a3b8 });
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.position.set(m, 0.12, -2.5);
      scene.add(mark);
    }

    // 7. Cabeços 3D Oficiais (Bollards 309 a 277)
    scenario.bollards.forEach((b) => {
      if (b.position === null) return;
      const bollardGroup = new THREE.Group();
      
      let bollardColor = 0x64748b;
      if (b.type === "duplo") bollardColor = 0x2563eb;
      else if (b.type === "baixo-antigo") bollardColor = 0xd97706;
      else if (b.type === "alto-antigo") bollardColor = 0x475569;
      else if (b.type === "avariado") bollardColor = 0xdc2626;

      const baseMat = new THREE.MeshStandardMaterial({ color: bollardColor, metalness: 0.6, roughness: 0.4 });
      
      if (b.type === "duplo") {
        // Cabeço Duplo (Dois pinos cilíndricos na mesma placa base)
        const plateGeo = new THREE.BoxGeometry(2.4, 0.35, 1.2);
        const plate = new THREE.Mesh(plateGeo, baseMat);
        plate.position.y = 0.18;
        bollardGroup.add(plate);

        [-0.65, 0.65].forEach((offset) => {
          const pinGeo = new THREE.CylinderGeometry(0.42, 0.45, 1.3, 14);
          const pin = new THREE.Mesh(pinGeo, baseMat);
          pin.position.set(offset, 0.8, 0);
          pin.castShadow = true;
          bollardGroup.add(pin);

          const capGeo = new THREE.SphereGeometry(0.48, 12, 10);
          const cap = new THREE.Mesh(capGeo, baseMat);
          cap.scale.set(1.1, 0.6, 1.1);
          cap.position.set(offset, 1.45, 0);
          bollardGroup.add(cap);
        });
      } else {
        // Cabeço Simples
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.58, 1.4, 14);
        const body = new THREE.Mesh(bodyGeo, baseMat);
        body.position.y = 0.7;
        body.castShadow = true;
        bollardGroup.add(body);

        const headGeo = new THREE.SphereGeometry(0.62, 14, 10);
        const head = new THREE.Mesh(headGeo, baseMat);
        head.scale.set(1.15, 0.65, 1.15);
        head.position.y = 1.4;
        head.castShadow = true;
        bollardGroup.add(head);
      }

      bollardGroup.position.set(b.position, 0.3, -1.8);
      scene.add(bollardGroup);
    });

    // 8. Defensas de Borracha (Rubber Fenders) na parede de cais
    for (let f = 15; f < totalQuay; f += 20) {
      const fenderGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.6, 12);
      const fenderMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });
      const fender = new THREE.Mesh(fenderGeo, fenderMat);
      fender.rotation.x = Math.PI / 2;
      fender.position.set(f, -1.8, 1.0);
      fender.castShadow = true;
      scene.add(fender);
    }

    // 9. CONSTRUÇÃO DETALHADA E FIEL DE CADA TIPO DE NAVIO
    scenario.vessels.forEach((vessel) => {
      const shipGroup = new THREE.Group();
      const loa = Math.max(25, vessel.loa);
      const beam = Math.max(8, vessel.beam);
      const draft = Math.max(3, vessel.draft);
      const freeboard = Math.max(10, draft * 1.35);

      // Sentido da proa (Boreste = proa à direita (+X), Bombordo = proa à esquerda (-X))
      const isBowRight = vessel.berthingSide === "boreste";
      const bowDirection = isBowRight ? 1 : -1;

      // Posição no cais
      const shipCenterX = vessel.position + loa / 2;
      const shipDistanceToQuay = beam / 2 + 3.2; // encostado nas defensas

      // Cor do casco
      const baseHullColor = vessel.color === "blue" ? 0x1e3a8a : vessel.color === "teal" ? 0x115e59 : vessel.color === "orange" ? 0xc2410c : 0x6b21a8;
      const hullMat = new THREE.MeshStandardMaterial({
        color: baseHullColor,
        roughness: 0.55,
        metalness: 0.35,
      });

      // 9.1 Casco Principal com curvas hidrodinâmicas
      const midLength = loa * 0.72;
      const mainHullGeo = new THREE.BoxGeometry(midLength, freeboard, beam);
      const mainHull = new THREE.Mesh(mainHullGeo, hullMat);
      mainHull.position.y = freeboard / 2;
      mainHull.castShadow = true;
      mainHull.receiveShadow = true;
      shipGroup.add(mainHull);

      // Proa afilada (Bow Wedge)
      const bowLength = loa * 0.18;
      const bowGeo = new THREE.ConeGeometry(beam / 2, bowLength, 4);
      const bow = new THREE.Mesh(bowGeo, hullMat);
      bow.rotation.z = isBowRight ? -Math.PI / 2 : Math.PI / 2;
      bow.scale.set(1, 1, 0.88);
      bow.position.set(bowDirection * (midLength / 2 + bowLength / 2), freeboard / 2, 0);
      bow.castShadow = true;
      shipGroup.add(bow);

      // Castelo de proa elevado (Forecastle Deck) com guinchos de ancoragem
      const fcastleGeo = new THREE.BoxGeometry(bowLength * 0.8, 2.2, beam * 0.85);
      const fcastleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
      const forecastle = new THREE.Mesh(fcastleGeo, fcastleMat);
      forecastle.position.set(bowDirection * (midLength / 2 + bowLength * 0.35), freeboard + 1.1, 0);
      forecastle.castShadow = true;
      shipGroup.add(forecastle);

      // Popa arredondada/espelho (Stern Transom)
      const sternLength = loa * 0.10;
      const sternGeo = new THREE.CylinderGeometry(beam * 0.45, beam * 0.48, freeboard, 12);
      const stern = new THREE.Mesh(sternGeo, hullMat);
      stern.position.set(-bowDirection * (midLength / 2 + sternLength * 0.3), freeboard / 2, 0);
      stern.castShadow = true;
      shipGroup.add(stern);

      // 9.2 MODELAGEM ESPECÍFICA POR TIPO DE NAVIO
      const vType = vessel.vesselType || "container";

      if (vType === "container") {
        // ==========================================
        // 🚢 NAVIO PORTA-CONTÊINERES (CONTAINER SHIP)
        // ==========================================
        // Baías de contêineres organizadas em bays e rows
        const bayAreaLength = loa * 0.64;
        const numBays = Math.max(3, Math.floor(bayAreaLength / 14.5));
        const bayWidth = beam * 0.86;
        const containerColors = [0x0284c7, 0x16a34a, 0xd97706, 0xdc2626, 0x475569, 0x0f766e, 0xb45309];

        const bayStartX = -bowDirection * (loa * 0.18);
        for (let b = 0; b < numBays; b++) {
          const bayX = bayStartX + bowDirection * (b * 14.2);
          const stackHeight = 5.5 + ((b * 3) % 4) * 2.5;

          // Pilha de contêineres TEU
          const stackGeo = new THREE.BoxGeometry(11.8, stackHeight, bayWidth);
          const stackMat = new THREE.MeshStandardMaterial({
            color: containerColors[(b * 2) % containerColors.length],
            roughness: 0.7,
          });
          const stack = new THREE.Mesh(stackGeo, stackMat);
          stack.position.set(bayX, freeboard + stackHeight / 2, 0);
          stack.castShadow = true;
          stack.receiveShadow = true;
          shipGroup.add(stack);

          // Passadiço de peação / guias celulares (Lashing Bridge) entre baías
          const lashingGeo = new THREE.BoxGeometry(1.2, stackHeight + 1.5, bayWidth + 1.2);
          const lashingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 });
          const lashing = new THREE.Mesh(lashingGeo, lashingMat);
          lashing.position.set(bayX + bowDirection * 6.5, freeboard + (stackHeight + 1.5) / 2, 0);
          lashing.castShadow = true;
          shipGroup.add(lashing);
        }

        // Casaria / Passadiço de Popa (Superstructure Tower & Bridge Wings)
        const towerLength = loa * 0.11;
        const towerHeight = 18;
        const towerGeo = new THREE.BoxGeometry(towerLength, towerHeight, beam * 0.75);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        const towerX = -bowDirection * (loa * 0.32);
        tower.position.set(towerX, freeboard + towerHeight / 2, 0);
        tower.castShadow = true;
        shipGroup.add(tower);

        // Asas da Ponte de Comando (Bridge Wings extendendo até a boca total)
        const wingsGeo = new THREE.BoxGeometry(towerLength * 0.65, 3.2, beam * 1.04);
        const wings = new THREE.Mesh(wingsGeo, towerMat);
        wings.position.set(towerX, freeboard + towerHeight - 1.6, 0);
        wings.castShadow = true;
        shipGroup.add(wings);

        // Chaminé com cor de armador (Funnel)
        const funnelGeo = new THREE.CylinderGeometry(2.4, 2.8, 8, 12);
        const funnelMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const funnel = new THREE.Mesh(funnelGeo, funnelMat);
        funnel.position.set(towerX - bowDirection * (towerLength * 0.65), freeboard + towerHeight + 4, 0);
        funnel.castShadow = true;
        shipGroup.add(funnel);

      } else if (vType === "tanker") {
        // ==========================================
        // 🛢️ NAVIO PETROLEIRO / QUÍMICO (TANKER)
        // ==========================================
        // Convés de carga longo com coamings de retenção
        const deckLength = loa * 0.70;
        const deckPlateGeo = new THREE.BoxGeometry(deckLength, 0.4, beam * 0.90);
        const deckPlateMat = new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.9 });
        const deckPlate = new THREE.Mesh(deckPlateGeo, deckPlateMat);
        deckPlate.position.set(0, freeboard + 0.2, 0);
        shipGroup.add(deckPlate);

        // Catwalk Central Elevado (Passadiço de pedestres)
        const catwalkGeo = new THREE.BoxGeometry(deckLength * 0.95, 0.3, 1.6);
        const catwalkMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5 });
        const catwalk = new THREE.Mesh(catwalkGeo, catwalkMat);
        catwalk.position.set(0, freeboard + 2.5, 0);
        catwalk.castShadow = true;
        shipGroup.add(catwalk);

        // Pilares do catwalk
        for (let cp = -deckLength * 0.45; cp <= deckLength * 0.45; cp += 12) {
          const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8);
          const post = new THREE.Mesh(postGeo, catwalkMat);
          post.position.set(cp, freeboard + 1.25, 0);
          shipGroup.add(post);
        }

        // Linhas de Tubulação de Carga e Gás no Convés (Deck Piping)
        [-2.5, 2.5, -4.0, 4.0].forEach((offsetZ, pIdx) => {
          const pipeColor = pIdx % 2 === 0 ? 0xdc2626 : 0x475569;
          const pipeMat = new THREE.MeshStandardMaterial({ color: pipeColor, metalness: 0.7, roughness: 0.3 });
          const pipeGeo = new THREE.CylinderGeometry(0.35, 0.35, deckLength * 0.9, 10);
          const pipe = new THREE.Mesh(pipeGeo, pipeMat);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(0, freeboard + 1.0, offsetZ);
          pipe.castShadow = true;
          shipGroup.add(pipe);
        });

        // MANIFOLD CENTRAL (Midship Cargo Manifold - Conexão de Mangotes de Cais)
        const manifoldGeo = new THREE.BoxGeometry(6, 3.5, beam * 0.96);
        const manifoldMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.6 });
        const manifold = new THREE.Mesh(manifoldGeo, manifoldMat);
        manifold.position.set(0, freeboard + 1.75, 0);
        manifold.castShadow = true;
        shipGroup.add(manifold);

        // Guindaste de Mangotes de Carga (Hose Handling Crane a meia-nau)
        const cranePostGeo = new THREE.CylinderGeometry(0.8, 1.0, 8, 10);
        const craneMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
        const cranePost = new THREE.Mesh(cranePostGeo, craneMat);
        cranePost.position.set(0, freeboard + 4, beam * 0.28);
        cranePost.castShadow = true;
        shipGroup.add(cranePost);

        const craneJibGeo = new THREE.BoxGeometry(1.0, 1.0, 14);
        const craneJib = new THREE.Mesh(craneJibGeo, craneMat);
        craneJib.position.set(0, freeboard + 8, beam * 0.28 - 4);
        craneJib.castShadow = true;
        shipGroup.add(craneJib);

        // Tanques e Domos de Inspeção Circulares (Expansion Domos)
        for (let t = -deckLength * 0.35; t <= deckLength * 0.35; t += 18) {
          [-beam * 0.25, beam * 0.25].forEach((zPos) => {
            const hatchGeo = new THREE.CylinderGeometry(1.4, 1.5, 1.2, 14);
            const hatchMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
            const hatch = new THREE.Mesh(hatchGeo, hatchMat);
            hatch.position.set(t, freeboard + 0.6, zPos);
            hatch.castShadow = true;
            shipGroup.add(hatch);
          });
        }

        // Casaria de Popa (Superestrutura de Petroleiro)
        const towerGeo = new THREE.BoxGeometry(loa * 0.13, 14, beam * 0.8);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        const towerX = -bowDirection * (loa * 0.34);
        tower.position.set(towerX, freeboard + 7, 0);
        tower.castShadow = true;
        shipGroup.add(tower);

      } else if (vType === "general-cargo") {
        // ==========================================
        // 📦 NAVIO DE CARGA GERAL / GRANELEIRO
        // ==========================================
        // Porões de carga com braçolas elevadas (Hatch Coamings & Pontoon Covers)
        const cargoLength = loa * 0.68;
        const numHatches = Math.max(2, Math.floor(cargoLength / 24));
        const hatchWidth = beam * 0.78;
        const hatchLength = 16;
        const hatchSpacing = cargoLength / numHatches;

        for (let h = 0; h < numHatches; h++) {
          const hX = -bowDirection * (cargoLength / 2) + bowDirection * (h * hatchSpacing + hatchSpacing / 2);
          
          // Braçola do porão (Hatch coaming)
          const coamingGeo = new THREE.BoxGeometry(hatchLength, 1.6, hatchWidth);
          const coamingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
          const coaming = new THREE.Mesh(coamingGeo, coamingMat);
          coaming.position.set(hX, freeboard + 0.8, 0);
          coaming.castShadow = true;
          shipGroup.add(coaming);

          // Tampa de escotilha corrugada (MacGregor hatch cover)
          const coverGeo = new THREE.BoxGeometry(hatchLength - 0.4, 0.6, hatchWidth - 0.4);
          const coverMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 });
          const cover = new THREE.Mesh(coverGeo, coverMat);
          cover.position.set(hX, freeboard + 1.7, 0);
          cover.castShadow = true;
          shipGroup.add(cover);

          // Guindastes de Convés Giratórios (Deck Cranes com lança entre os porões)
          if (h < numHatches - 1) {
            const craneX = hX + bowDirection * (hatchSpacing / 2);
            const pedGeo = new THREE.CylinderGeometry(1.2, 1.4, 6, 12);
            const pedMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
            const pedestal = new THREE.Mesh(pedGeo, pedMat);
            pedestal.position.set(craneX, freeboard + 3, 0);
            pedestal.castShadow = true;
            shipGroup.add(pedestal);

            // Cabine e Lança do guindaste
            const cabGeo = new THREE.BoxGeometry(2.8, 2.6, 2.4);
            const cab = new THREE.Mesh(cabGeo, pedMat);
            cab.position.set(craneX, freeboard + 6.8, 0);
            cab.castShadow = true;
            shipGroup.add(cab);

            const jibGeo = new THREE.BoxGeometry(hatchSpacing * 0.85, 0.9, 0.9);
            const jib = new THREE.Mesh(jibGeo, pedMat);
            jib.position.set(craneX + bowDirection * (hatchSpacing * 0.4), freeboard + 7.5, 0);
            jib.castShadow = true;
            shipGroup.add(jib);
          }
        }

        // Casaria de Popa
        const towerGeo = new THREE.BoxGeometry(loa * 0.12, 15, beam * 0.75);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        const towerX = -bowDirection * (loa * 0.35);
        tower.position.set(towerX, freeboard + 7.5, 0);
        tower.castShadow = true;
        shipGroup.add(tower);

      } else if (vType === "offshore") {
        // ==========================================
        // ⚓ NAVIO DE APOIO OFFSHORE (PSV / AHTS)
        // ==========================================
        // PSVs possuem superestrutura bem avançada na proa e convés livre na popa
        const aftDeckLength = loa * 0.58;
        const aftDeckWidth = beam * 0.88;
        const deckPlateGeo = new THREE.BoxGeometry(aftDeckLength, 0.3, aftDeckWidth);
        const deckPlateMat = new THREE.MeshStandardMaterial({
          color: 0x92400e, // convés revestido de madeira/aço anti-impacto
          roughness: 0.9,
        });
        const aftDeck = new THREE.Mesh(deckPlateGeo, deckPlateMat);
        const aftDeckX = -bowDirection * (loa * 0.16);
        aftDeck.position.set(aftDeckX, freeboard + 0.15, 0);
        aftDeck.receiveShadow = true;
        shipGroup.add(aftDeck);

        // Grades de proteção de carga laterais (Crash Rails)
        [-aftDeckWidth / 2, aftDeckWidth / 2].forEach((zPos) => {
          const railGeo = new THREE.BoxGeometry(aftDeckLength, 2.4, 0.3);
          const railMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5 });
          const rail = new THREE.Mesh(railGeo, railMat);
          rail.position.set(aftDeckX, freeboard + 1.2, zPos);
          rail.castShadow = true;
          shipGroup.add(rail);
        });

        // Carga estivada no convés offshore (tubos de perfuração ou contêineres offshore)
        const pipeBundleGeo = new THREE.CylinderGeometry(0.4, 0.4, aftDeckLength * 0.5, 8);
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
        for (let pz = -aftDeckWidth * 0.25; pz <= aftDeckWidth * 0.25; pz += 1.8) {
          const pipe = new THREE.Mesh(pipeBundleGeo, pipeMat);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(aftDeckX - bowDirection * 4, freeboard + 0.8, pz);
          pipe.castShadow = true;
          shipGroup.add(pipe);
        }

        // Superestrutura Avançada na Proa (Wheelhouse com visão 360°)
        const bridgeLength = loa * 0.24;
        const bridgeHeight = 16;
        const bridgeWidth = beam * 0.92;
        const bridgeGeo = new THREE.BoxGeometry(bridgeLength, bridgeHeight, bridgeWidth);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        const bridgeX = bowDirection * (loa * 0.22);
        bridge.position.set(bridgeX, freeboard + bridgeHeight / 2, 0);
        bridge.castShadow = true;
        shipGroup.add(bridge);

        // Bote de Resgate Rápido (FRC) em turco lateral
        const frcGeo = new THREE.BoxGeometry(5.5, 1.4, 2.0);
        const frcMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
        const frc = new THREE.Mesh(frcGeo, frcMat);
        frc.position.set(bridgeX - bowDirection * (bridgeLength * 0.6), freeboard + 4.5, beam * 0.46);
        frc.castShadow = true;
        shipGroup.add(frc);

        // Mastro Offshore com radares duplos
        const mastGeo = new THREE.CylinderGeometry(0.3, 0.5, 9, 8);
        const mastMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        const mast = new THREE.Mesh(mastGeo, mastMat);
        mast.position.set(bridgeX, freeboard + bridgeHeight + 4.5, 0);
        mast.castShadow = true;
        shipGroup.add(mast);
      }

      // Posiciona o Navio no Cais
      shipGroup.position.set(shipCenterX, 0, shipDistanceToQuay);
      scene.add(shipGroup);

      // 9.3 CABOS DE AMARRAÇÃO 3D CONECTADOS AOS CABEÇOS
      if (showMooringLines && vessel.mooringLines && vessel.mooringLines.length > 0) {
        vessel.mooringLines.forEach((line) => {
          if (line.shipOffset === null) return;
          const bollard = scenario.bollards.find((b) => b.id === line.bollardId);
          if (!bollard || bollard.position === null) return;

          // Ponto no Navio
          const shipLineX = vessel.position + line.shipOffset;
          const shipLineY = freeboard - 1.2;
          const shipLineZ = shipDistanceToQuay - (beam / 2); // face voltada para o cais

          // Ponto no Cabeço
          const bollardX = bollard.position;
          const bollardY = 1.0;
          const bollardZ = -1.8;

          const points = [
            new THREE.Vector3(shipLineX, shipLineY, shipLineZ),
            new THREE.Vector3(bollardX, bollardY, bollardZ),
          ];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const isSpring = line.type.includes("spring");
          const lineMat = new THREE.LineBasicMaterial({
            color: isSpring ? 0x22c55e : 0xf97316,
            linewidth: 3,
          });
          const mooringLine = new THREE.Line(lineGeo, lineMat);
          scene.add(mooringLine);
        });
      }
    });

    // 10. MODELAGEM REALISTA DOS PORTÊINERES STS (P4 A P9)
    if (showPortainers && (scenario.showPortainers ?? true)) {
      const portainers = scenario.portainers ?? [];
      portainers.filter((pt) => pt.enabled).forEach((pt) => {
        const craneGroup = new THREE.Group();
        const craneColor = 0x15803d; // verde portêiner característico
        const structureMat = new THREE.MeshStandardMaterial({
          color: craneColor,
          metalness: 0.6,
          roughness: 0.45,
        });

        // 10.1 Pernas do Pórtico (Waterside & Landside Legs)
        const legHeight = 42;
        const legFrontZ = -3.5;  // trilho da frente
        const legBackZ = -23.5;  // trilho de trás (bitola de 20 metros)

        [-9, 9].forEach((dx) => {
          // Perna frontal
          const frontLegGeo = new THREE.BoxGeometry(2.2, legHeight, 2.2);
          const frontLeg = new THREE.Mesh(frontLegGeo, structureMat);
          frontLeg.position.set(dx, legHeight / 2, legFrontZ);
          frontLeg.castShadow = true;
          craneGroup.add(frontLeg);

          // Perna traseira
          const backLegGeo = new THREE.BoxGeometry(2.2, legHeight, 2.2);
          const backLeg = new THREE.Mesh(backLegGeo, structureMat);
          backLeg.position.set(dx, legHeight / 2, legBackZ);
          backLeg.castShadow = true;
          craneGroup.add(backLeg);

          // Viga de ligação entre pernas (Diagonal Bracing)
          const braceGeo = new THREE.BoxGeometry(1.4, 1.4, 20);
          const brace = new THREE.Mesh(braceGeo, structureMat);
          brace.position.set(dx, legHeight * 0.55, -13.5);
          craneGroup.add(brace);
        });

        // 10.2 Viga Mestra / Lança Horizontal (Boom & Girder)
        // Lança estendida sobre os navios (Outreach de 52 metros sobre a água)
        const boomLength = 95;
        const boomGeo = new THREE.BoxGeometry(18, 4.2, boomLength);
        const boom = new THREE.Mesh(boomGeo, structureMat);
        boom.position.set(0, legHeight + 2.1, 14); // projetada sobre a bacia de atracação
        boom.castShadow = true;
        craneGroup.add(boom);

        // 10.3 Carrinho de Carga (Trolley) e Cabine do Operador
        const trolleyGeo = new THREE.BoxGeometry(6, 3.5, 6);
        const trolleyMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 }); // amarelo operacional
        const trolley = new THREE.Mesh(trolleyGeo, trolleyMat);
        trolley.position.set(0, legHeight - 0.5, 18);
        trolley.castShadow = true;
        craneGroup.add(trolley);

        // Cabos do Spreader de Contêineres
        const cableGeo = new THREE.CylinderGeometry(0.1, 0.1, 16, 6);
        const cableMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
        [-1.8, 1.8].forEach((cx) => {
          const cable = new THREE.Mesh(cableGeo, cableMat);
          cable.position.set(cx, legHeight - 8.5, 18);
          craneGroup.add(cable);
        });

        // Spreader de 20'/40'
        const spreaderGeo = new THREE.BoxGeometry(12.5, 1.2, 2.8);
        const spreaderMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 }); // vermelho
        const spreader = new THREE.Mesh(spreaderGeo, spreaderMat);
        spreader.position.set(0, legHeight - 16.5, 18);
        spreader.castShadow = true;
        craneGroup.add(spreader);

        // 10.4 Torre Superior em A-Frame (Apex Tower)
        const aFrameGeo = new THREE.ConeGeometry(8, 22, 4);
        const aFrame = new THREE.Mesh(aFrameGeo, structureMat);
        aFrame.position.set(0, legHeight + 14, -13.5);
        aFrame.castShadow = true;
        craneGroup.add(aFrame);

        // Posiciona o Portêiner na estação métrica do cais
        craneGroup.position.set(pt.position, 0, 0);
        scene.add(craneGroup);
      });
    }

    // 11. Eventos de Mouse para Pan e Interatividade
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const panFactor = (totalQuay / width) / zoomLevel;
      panOffset.current.x -= dx * panFactor;
      panOffset.current.y += dy * panFactor;

      if (camera instanceof THREE.OrthographicCamera) {
        camera.position.x = panOffset.current.x;
        camera.position.z = panOffset.current.y;
        camera.lookAt(panOffset.current.x, 0, panOffset.current.y);
      } else {
        const dist = 800 / zoomLevel;
        camera.position.set(panOffset.current.x, dist * 0.65, panOffset.current.y + dist * 0.85);
        camera.lookAt(panOffset.current.x, 0, panOffset.current.y);
      }
      renderer.render(scene, camera);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomLevel((prev) => Math.max(0.5, Math.min(4.0, Number((prev - e.deltaY * 0.0015).toFixed(2)))));
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dom.addEventListener("wheel", handleWheel, { passive: false });

    // Render Inicial
    renderer.render(scene, camera);

    // Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const newAspect = w / h;

      if (cameraRef.current instanceof THREE.OrthographicCamera) {
        const fSize = (totalQuay * 0.45) / zoomLevel;
        cameraRef.current.left = (-fSize * newAspect) / 2;
        cameraRef.current.right = (fSize * newAspect) / 2;
        cameraRef.current.top = fSize / 2;
        cameraRef.current.bottom = -fSize / 2;
        cameraRef.current.updateProjectionMatrix();
      } else {
        cameraRef.current.aspect = newAspect;
        cameraRef.current.updateProjectionMatrix();
      }
      rendererRef.current.setSize(w, h);
      rendererRef.current.render(sceneRef.current!, cameraRef.current);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      dom.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      dom.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container) container.innerHTML = "";
    };
  }, [scenario, viewMode, isNight, showPortainers, showMooringLines, zoomLevel]);

  return (
    <div className="relative flex flex-col w-full h-full bg-slate-950 select-none overflow-hidden">
      {/* Barra de Controles Superiores do View 2D Three.js */}
      <div className="absolute top-3 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Modos de Câmera 2D */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-lg shadow-lg pointer-events-auto">
          <button
            type="button"
            onClick={() => setViewMode("ortho")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === "ortho" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
            title="Vista 2D Top-Down Ortográfica (Planta de Engenharia Perpendicular)"
          >
            2D Ortográfica
          </button>
          <button
            type="button"
            onClick={() => setViewMode("iso")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === "iso" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
            title="Vista 2.5D Isométrica Tática com Relevo e Sombras"
          >
            2.5D Isométrica
          </button>
        </div>

        {/* Camadas e Filtros Operacionais */}
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-lg shadow-lg pointer-events-auto">
          <label className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPortainers}
              onChange={(e) => setShowPortainers(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-500 rounded"
            />
            <span>Portêineres (P4–P9)</span>
          </label>

          <label className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer select-none border-l border-slate-800">
            <input
              type="checkbox"
              checked={showMooringLines}
              onChange={(e) => setShowMooringLines(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-500 rounded"
            />
            <span>Cabos</span>
          </label>

          {/* Alternar Dia / Noite */}
          <button
            type="button"
            onClick={() => setIsNight((n) => !n)}
            className={`p-1.5 rounded-md border transition ml-1 ${
              isNight ? "bg-indigo-950 text-amber-300 border-indigo-800" : "bg-slate-800 text-amber-400 border-slate-700"
            }`}
            title={isNight ? "Modo Dia (Iluminação solar)" : "Modo Noite (Refletores de cais)"}
          >
            {isNight ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>

        {/* Controles de Zoom */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-lg shadow-lg pointer-events-auto">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="Diminuir Zoom"
          >
            <ZoomOut size={15} />
          </button>
          <span className="px-2 font-mono text-xs font-bold text-cyan-400 min-w-[48px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
            title="Aumentar Zoom"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoomLevel(1.5);
              panOffset.current = { x: totalQuay / 2, y: 35 };
            }}
            className="px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white border-l border-slate-800 transition"
            title="Centralizar e restaurar zoom padrão 150%"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas Three.js Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Legenda Flutuante Náutica */}
      <div className="absolute bottom-3 left-4 z-20 flex flex-wrap items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-300 shadow-xl pointer-events-none">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          <Info size={13} className="text-cyan-400" />
          <span>Fidelidade Naval Three.js:</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-xs bg-[#0284c7] inline-block" />
          <span>Contêiner</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-xs bg-[#713f12] inline-block" />
          <span>Petroleiro/Químico (Manifold + Catwalk)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-xs bg-[#991b1b] inline-block" />
          <span>Carga Geral (Guindastes + Porões)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-xs bg-[#92400e] inline-block" />
          <span>Apoio Offshore (Deck Aft + Crash Rails)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-xs bg-[#15803d] inline-block" />
          <span>Portêineres STS (Trilhos + Lança)</span>
        </span>
      </div>
    </div>
  );
}
