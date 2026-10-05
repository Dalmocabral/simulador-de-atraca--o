import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  X,
  Maximize2,
  Minimize2,
  Box,
  RotateCw,
  Sun,
  Moon,
  Camera,
  Layers,
  Info,
} from "lucide-react";
import { Scenario, Vessel, Portainer } from "@/lib/berth-model";

interface Berth3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
}

export default function Berth3DModal({ isOpen, onClose, scenario }: Berth3DModalProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isNight, setIsNight] = useState(false);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [activeCameraView, setActiveCameraView] = useState<"iso" | "top" | "quay">("iso");

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const isOrbitingRef = useRef(false);
  isOrbitingRef.current = isOrbiting;

  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
    cameraRef.current = camera;
    setCameraPreset("iso", camera);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // 4. Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(isNight ? 0x223355 : 0xffffff, isNight ? 0.7 : 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(isNight ? 0x6688cc : 0xfffaf0, isNight ? 0.6 : 1.3);
    sunLight.position.set(450, 400, 350);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 1500;
    sunLight.shadow.camera.left = -600;
    sunLight.shadow.camera.right = 600;
    sunLight.shadow.camera.top = 400;
    sunLight.shadow.camera.bottom = -400;
    scene.add(sunLight);

    // 5. Sky / Background
    scene.background = new THREE.Color(isNight ? 0x091422 : 0xbfdff2);

    // 6. Water Plane
    const waterGeo = new THREE.PlaneGeometry(2400, 1600, 32, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x0a223a : 0x1d6a8a,
      roughness: 0.15,
      metalness: 0.6,
      flatShading: false,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(450, -4, 300);
    water.receiveShadow = true;
    scene.add(water);

    // Total Quay Length
    const totalQuay = scenario.segments.reduce((acc, s) => acc + s.length, 0) || 900;

    // 7. Quay Structure (Concrete pier deck)
    const quayDepth = 70; // largura do cais em metros
    const quayHeight = 12; // altura da borda livre até a água
    const quayGeo = new THREE.BoxGeometry(totalQuay + 40, quayHeight, quayDepth);
    const quayMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // concreto claro
      roughness: 0.85,
    });
    const quay = new THREE.Mesh(quayGeo, quayMat);
    quay.position.set(totalQuay / 2, quayHeight / 2 - 4, -quayDepth / 2);
    quay.receiveShadow = true;
    quay.castShadow = true;
    scene.add(quay);

    // Faixa amarela de segurança na borda do cais (Coping edge)
    const curbGeo = new THREE.BoxGeometry(totalQuay + 40, 0.4, 1.2);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(totalQuay / 2, quayHeight - 3.8, -0.6);
    scene.add(curb);

    // Marcações métricas no cais a cada 50 metros
    for (let m = 0; m <= totalQuay; m += 50) {
      const lineGeo = new THREE.BoxGeometry(0.5, 0.05, 5);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(m, quayHeight - 3.85, -2.5);
      scene.add(line);
    }

    // 8. Cabeços 3D (Bollards) ao longo do cais
    scenario.bollards.forEach((b) => {
      if (b.position === null) return;
      const bollardGroup = new THREE.Group();
      
      // Cor de acordo com o tipo
      let bollardColor = 0x64748b;
      if (b.type === "duplo") bollardColor = 0x2563eb;
      else if (b.type === "baixo-antigo") bollardColor = 0xd97706;
      else if (b.type === "alto-antigo") bollardColor = 0x475569;
      else if (b.type === "avariado") bollardColor = 0xdc2626;

      const baseGeo = new THREE.CylinderGeometry(0.8, 1.0, 1.4, 12);
      const headGeo = new THREE.SphereGeometry(0.9, 12, 10);
      const bollardMat = new THREE.MeshStandardMaterial({
        color: bollardColor,
        roughness: 0.4,
        metalness: 0.7,
      });

      const base = new THREE.Mesh(baseGeo, bollardMat);
      base.castShadow = true;
      base.position.y = 0.7;
      bollardGroup.add(base);

      const head = new THREE.Mesh(headGeo, bollardMat);
      head.castShadow = true;
      head.position.y = 1.4;
      head.scale.set(1.1, 0.7, 1.1);
      bollardGroup.add(head);

      // Posiciona no topo do cais, 1.5m recuado da borda da água
      bollardGroup.position.set(b.position, quayHeight - 4, -1.8);
      scene.add(bollardGroup);
    });

    // 9. Defensas de borracha pretas (Fenders) na face do cais
    for (let f = 20; f < totalQuay; f += 25) {
      const fenderGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.5, 10);
      const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
      const fender = new THREE.Mesh(fenderGeo, fenderMat);
      fender.rotation.x = Math.PI / 2;
      fender.position.set(f, quayHeight - 7, 0.9);
      fender.castShadow = true;
      scene.add(fender);
    }

    // 10. Navios 3D (Vessels)
    scenario.vessels.forEach((v) => {
      const shipGroup = new THREE.Group();
      const loa = Math.max(20, v.loa);
      const beam = Math.max(10, v.beam);
      const freeboard = 14; // altura da borda livre

      // Casco do Navio (Hull)
      const hullGeo = new THREE.BoxGeometry(loa * 0.92, freeboard, beam);
      // Cores: Casco inferior escuro, amurada na cor do navio
      const hullColor = v.color === "blue" ? 0x1e40af : v.color === "teal" ? 0x0f766e : v.color === "orange" ? 0xc2410c : 0x7c3aed;
      const hullMat = new THREE.MeshStandardMaterial({
        color: hullColor,
        roughness: 0.5,
        metalness: 0.3,
      });
      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.position.y = freeboard / 2 - 2;
      hull.castShadow = true;
      hull.receiveShadow = true;
      shipGroup.add(hull);

      // Sentido da proa (Boreste = proa à direita (+X), Bombordo = proa à esquerda (-X))
      const isBowRight = v.berthingSide === "boreste";
      const bowDirection = isBowRight ? 1 : -1;

      // Proa inclinada (Bow Wedge)
      const bowGeo = new THREE.ConeGeometry(beam / 2, loa * 0.16, 4);
      const bow = new THREE.Mesh(bowGeo, hullMat);
      bow.rotation.z = isBowRight ? -Math.PI / 2 : Math.PI / 2;
      bow.scale.set(1, 1, 0.85);
      bow.position.set(bowDirection * (loa * 0.44), freeboard / 2 - 2, 0);
      bow.castShadow = true;
      shipGroup.add(bow);

      // Modelagem específica conforme o tipo do navio
      const vType = v.vesselType || "container";

      if (vType === "container") {
        // --- PORTA-CONTÊINERES ---
        const bridgeHeight = 16;
        const bridgeGeo = new THREE.BoxGeometry(loa * 0.12, bridgeHeight, beam * 0.85);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        const bridgeX = -bowDirection * (loa * 0.32);
        bridge.position.set(bridgeX, freeboard + bridgeHeight / 2 - 2, 0);
        bridge.castShadow = true;
        shipGroup.add(bridge);

        const funnelGeo = new THREE.CylinderGeometry(2, 2.5, 7, 8);
        const funnelMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const funnel = new THREE.Mesh(funnelGeo, funnelMat);
        funnel.position.set(bridgeX - bowDirection * 4, freeboard + bridgeHeight + 2, 0);
        funnel.castShadow = true;
        shipGroup.add(funnel);

        const containerBayLength = loa * 0.58;
        const bayCount = Math.floor(containerBayLength / 14);
        const bayWidth = beam * 0.82;
        const containerColors = [0x0284c7, 0x16a34a, 0xd97706, 0xdc2626, 0x475569];

        for (let i = 0; i < bayCount; i++) {
          const stackHeight = 5 + (i % 3) * 3;
          const cGeo = new THREE.BoxGeometry(11, stackHeight, bayWidth);
          const cMat = new THREE.MeshStandardMaterial({
            color: containerColors[i % containerColors.length],
            roughness: 0.6,
          });
          const containerStack = new THREE.Mesh(cGeo, cMat);
          const posX = -bowDirection * (loa * 0.16) + bowDirection * (i * 13.5);
          containerStack.position.set(posX, freeboard + stackHeight / 2 - 2, 0);
          containerStack.castShadow = true;
          shipGroup.add(containerStack);
        }
      } else if (vType === "tanker") {
        // --- PETROLEIRO / QUÍMICO ---
        const catwalkGeo = new THREE.BoxGeometry(loa * 0.68, 0.3, 1.8);
        const catwalkMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5 });
        const catwalk = new THREE.Mesh(catwalkGeo, catwalkMat);
        catwalk.position.set(0, freeboard + 2.2, 0);
        catwalk.castShadow = true;
        shipGroup.add(catwalk);

        // Manifold Central de Carga
        const manifoldGeo = new THREE.BoxGeometry(6, 3.2, beam * 0.95);
        const manifoldMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.6 });
        const manifold = new THREE.Mesh(manifoldGeo, manifoldMat);
        manifold.position.set(0, freeboard + 1.6, 0);
        manifold.castShadow = true;
        shipGroup.add(manifold);

        // Guindaste de mangotes a meia-nau
        const pedGeo = new THREE.CylinderGeometry(0.8, 0.9, 7, 8);
        const craneMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
        const ped = new THREE.Mesh(pedGeo, craneMat);
        ped.position.set(0, freeboard + 3.5, beam * 0.28);
        ped.castShadow = true;
        shipGroup.add(ped);

        // Tubulações no convés
        [-2.5, 2.5].forEach((pz) => {
          const pipeGeo = new THREE.CylinderGeometry(0.35, 0.35, loa * 0.65, 8);
          const pipeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.8 });
          const pipe = new THREE.Mesh(pipeGeo, pipeMat);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(0, freeboard + 1.0, pz);
          shipGroup.add(pipe);
        });

        // Casaria de Popa
        const bridgeGeo = new THREE.BoxGeometry(loa * 0.13, 14, beam * 0.8);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.set(-bowDirection * (loa * 0.32), freeboard + 7 - 2, 0);
        bridge.castShadow = true;
        shipGroup.add(bridge);
      } else if (vType === "general-cargo") {
        // --- CARGA GERAL / GRANELEIRO ---
        const numHatches = Math.max(2, Math.floor((loa * 0.6) / 22));
        const hatchSpacing = (loa * 0.6) / numHatches;

        for (let h = 0; h < numHatches; h++) {
          const hX = -bowDirection * (loa * 0.25) + bowDirection * (h * hatchSpacing);
          const hatchGeo = new THREE.BoxGeometry(15, 2.2, beam * 0.78);
          const hatchMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 });
          const hatch = new THREE.Mesh(hatchGeo, hatchMat);
          hatch.position.set(hX, freeboard + 1.1 - 2, 0);
          hatch.castShadow = true;
          shipGroup.add(hatch);

          // Guindastes entre porões
          if (h < numHatches - 1) {
            const craneX = hX + bowDirection * (hatchSpacing / 2);
            const pedGeo = new THREE.CylinderGeometry(1.0, 1.2, 7, 10);
            const pedMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
            const ped = new THREE.Mesh(pedGeo, pedMat);
            ped.position.set(craneX, freeboard + 3.5 - 2, 0);
            ped.castShadow = true;
            shipGroup.add(ped);

            const jibGeo = new THREE.BoxGeometry(hatchSpacing * 0.85, 0.8, 0.8);
            const jib = new THREE.Mesh(jibGeo, pedMat);
            jib.position.set(craneX + bowDirection * (hatchSpacing * 0.4), freeboard + 7 - 2, 0);
            jib.castShadow = true;
            shipGroup.add(jib);
          }
        }

        const bridgeGeo = new THREE.BoxGeometry(loa * 0.12, 15, beam * 0.75);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.set(-bowDirection * (loa * 0.33), freeboard + 7.5 - 2, 0);
        bridge.castShadow = true;
        shipGroup.add(bridge);
      } else if (vType === "offshore") {
        // --- APOIO OFFSHORE (PSV / AHTS) ---
        const aftDeckGeo = new THREE.BoxGeometry(loa * 0.55, 0.3, beam * 0.86);
        const aftDeckMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
        const aftDeck = new THREE.Mesh(aftDeckGeo, aftDeckMat);
        aftDeck.position.set(-bowDirection * (loa * 0.16), freeboard - 1.8, 0);
        shipGroup.add(aftDeck);

        // Crash rails laterais
        [-beam * 0.43, beam * 0.43].forEach((rz) => {
          const railGeo = new THREE.BoxGeometry(loa * 0.55, 2.2, 0.3);
          const railMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
          const rail = new THREE.Mesh(railGeo, railMat);
          rail.position.set(-bowDirection * (loa * 0.16), freeboard - 0.7, rz);
          rail.castShadow = true;
          shipGroup.add(rail);
        });

        // Superestrutura na proa (Wheelhouse avançada)
        const bridgeGeo = new THREE.BoxGeometry(loa * 0.22, 16, beam * 0.90);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.set(bowDirection * (loa * 0.22), freeboard + 8 - 2, 0);
        bridge.castShadow = true;
        shipGroup.add(bridge);
      }

      // Posiciona o navio ao longo do cais
      // Posição no cais + metade do LOA para centralizar
      const shipCenterX = v.position + loa / 2;
      const shipZ = beam / 2 + 3.5; // afastado da borda do cais pelas defensas
      shipGroup.position.set(shipCenterX, 0, shipZ);
      scene.add(shipGroup);

      // Cabos de amarração 3D conectando aos cabeços
      if (v.mooringLines && v.mooringLines.length > 0) {
        v.mooringLines.forEach((line) => {
          if (line.shipOffset === null) return;
          const bollard = scenario.bollards.find((b) => b.id === line.bollardId);
          if (!bollard || bollard.position === null) return;

          // Ponto no navio
          const shipLineX = v.position + line.shipOffset;
          const shipLineY = freeboard - 1;
          const shipLineZ = shipZ - (beam / 2); // face do navio voltada para o cais

          // Ponto no cabeço
          const bollardX = bollard.position;
          const bollardY = quayHeight - 2.8;
          const bollardZ = -1.8;

          const points = [
            new THREE.Vector3(shipLineX, shipLineY, shipLineZ),
            new THREE.Vector3(bollardX, bollardY, bollardZ),
          ];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const lineMat = new THREE.LineBasicMaterial({
            color: line.type.includes("spring") ? 0x22c55e : 0xf97316,
            linewidth: 3,
          });
          const mooringLine = new THREE.Line(lineGeo, lineMat);
          scene.add(mooringLine);
        });
      }
    });

    // 11. Portêineres 3D (STS Cranes)
    if (scenario.showPortainers ?? true) {
      const portainers = scenario.portainers ?? [];
      portainers.filter((pt) => pt.enabled).forEach((pt) => {
        const craneGroup = new THREE.Group();
        const craneColor = 0x15803d; // verde portêiner

        // Pernas do Pórtico (Legs)
        const legMat = new THREE.MeshStandardMaterial({ color: craneColor, metalness: 0.5, roughness: 0.5 });
        const legHeight = 44;

        // Perna da frente e perna de trás
        [-10, 10].forEach((dx) => {
          [-30, -5].forEach((dz) => {
            const legGeo = new THREE.BoxGeometry(2, legHeight, 2);
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(dx, legHeight / 2 + (quayHeight - 4), dz);
            leg.castShadow = true;
            craneGroup.add(leg);
          });
        });

        // Viga horizontal / Boom (lança sobre a água e navios)
        const boomGeo = new THREE.BoxGeometry(18, 4, 90);
        const boom = new THREE.Mesh(boomGeo, legMat);
        boom.position.set(0, legHeight + (quayHeight - 4), 10);
        boom.castShadow = true;
        craneGroup.add(boom);

        // Cabine do Operador
        const cabGeo = new THREE.BoxGeometry(5, 5, 6);
        const cabMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const cab = new THREE.Mesh(cabGeo, cabMat);
        cab.position.set(0, legHeight + (quayHeight - 6), 25);
        craneGroup.add(cab);

        // Posiciona no cais
        craneGroup.position.set(pt.position, 0, 0);
        scene.add(craneGroup);
      });
    }

    // 12. Mouse Drag Orbit & Controls
    let isMouseDown = false;
    let prevMousePos = { x: 0, y: 0 };
    let spherical = {
      radius: camera.position.distanceTo(new THREE.Vector3(totalQuay / 2, 20, 0)),
      theta: Math.atan2(camera.position.x - totalQuay / 2, camera.position.z),
      phi: Math.acos((camera.position.y - 20) / camera.position.distanceTo(new THREE.Vector3(totalQuay / 2, 20, 0))),
    };

    const targetLookAt = new THREE.Vector3(totalQuay / 2, 20, 30);

    const onMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      prevMousePos = { x: e.clientX, y: e.clientY };

      spherical.theta -= deltaX * 0.006;
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, spherical.phi - deltaY * 0.006));

      updateCameraPosition();
    };

    const onMouseUp = () => {
      isMouseDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(80, Math.min(2000, spherical.radius + e.deltaY * 0.8));
      updateCameraPosition();
    };

    function updateCameraPosition() {
      if (!cameraRef.current) return;
      cameraRef.current.position.x = targetLookAt.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      cameraRef.current.position.y = targetLookAt.y + spherical.radius * Math.cos(spherical.phi);
      cameraRef.current.position.z = targetLookAt.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      cameraRef.current.lookAt(targetLookAt);
    }

    const domElement = renderer.domElement;
    domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    domElement.addEventListener("wheel", onWheel, { passive: false });

    // 13. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (isOrbitingRef.current) {
        spherical.theta += 0.003;
        updateCameraPosition();
      }

      renderer.render(scene, camera);
    };
    animate();

    // 14. Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [isOpen, scenario, isNight]);

  function setCameraPreset(preset: "iso" | "top" | "quay", cam?: THREE.PerspectiveCamera) {
    const camera = cam || cameraRef.current;
    if (!camera) return;

    setActiveCameraView(preset);
    const totalQuay = scenario.segments.reduce((acc, s) => acc + s.length, 0) || 900;
    const target = new THREE.Vector3(totalQuay / 2, 20, 30);

    if (preset === "iso") {
      camera.position.set(totalQuay / 2 + 380, 280, 480);
    } else if (preset === "top") {
      camera.position.set(totalQuay / 2, 750, 40);
    } else if (preset === "quay") {
      camera.position.set(totalQuay / 2 - 100, 35, -70);
    }
    camera.lookAt(target);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200">
      {/* Barra de Ferramentas Superior 3D */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/90 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
            <Box size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">Visualização 3D · Cais e Navios</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                WebGL 3D
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {scenario.name} · {scenario.vessels.length} navios no cais · Arraste o mouse para orbitar, scroll para zoom
            </p>
          </div>
        </div>

        {/* Controles de Câmera & Visualização */}
        <div className="flex items-center gap-2">
          {/* Câmeras Predefinidas */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setCameraPreset("iso")}
              className={`px-3 py-1 text-xs font-semibold rounded transition ${
                activeCameraView === "iso" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Visão Isométrica Perspectiva"
            >
              Isométrica
            </button>
            <button
              type="button"
              onClick={() => setCameraPreset("top")}
              className={`px-3 py-1 text-xs font-semibold rounded transition ${
                activeCameraView === "top" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Visão Aérea Superior"
            >
              Topo
            </button>
            <button
              type="button"
              onClick={() => setCameraPreset("quay")}
              className={`px-3 py-1 text-xs font-semibold rounded transition ${
                activeCameraView === "quay" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Visão do Cais"
            >
              Do Cais
            </button>
          </div>

          {/* Rotação Automática (Orbit) */}
          <button
            type="button"
            onClick={() => setIsOrbiting((prev) => !prev)}
            className={`p-2 rounded-lg border transition ${
              isOrbiting
                ? "bg-cyan-600 text-white border-cyan-500"
                : "bg-slate-800 text-slate-400 hover:text-white border-slate-700"
            }`}
            title={isOrbiting ? "Parar Rotação Automática" : "Ativar Rotação Automática (Órbita)"}
          >
            <RotateCw size={16} className={isOrbiting ? "animate-spin" : ""} />
          </button>

          {/* Modo Noite / Dia */}
          <button
            type="button"
            onClick={() => setIsNight((prev) => !prev)}
            className={`p-2 rounded-lg border transition ${
              isNight
                ? "bg-indigo-900 text-amber-300 border-indigo-700"
                : "bg-slate-800 text-amber-400 hover:text-white border-slate-700"
            }`}
            title={isNight ? "Mudar para Modo Dia" : "Mudar para Modo Noite"}
          >
            {isNight ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          {/* Fechar */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 ml-2 bg-slate-800 hover:bg-red-950 hover:text-red-400 text-slate-400 rounded-lg border border-slate-700 transition"
            title="Fechar Visualização 3D"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Área de Renderização 3D Three.js */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Legenda Informativa Flutuante */}
        <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 max-w-sm pointer-events-none shadow-xl">
          <div className="flex items-center gap-2 font-bold text-white mb-1.5">
            <Info size={14} className="text-cyan-400" />
            <span>Controles Interativos</span>
          </div>
          <div className="space-y-1 text-[11px] text-slate-400">
            <div>• <strong>Clique e arraste</strong> para girar a câmera ao redor do cais</div>
            <div>• <strong>Scroll do mouse</strong> para aproximar ou afastar (zoom)</div>
            <div>• Navios, portêineres e cabos são posicionados com base no plano operacional</div>
          </div>
        </div>
      </div>
    </div>
  );
}
