import { toast } from "sonner";

export async function exportAndShareBerthImage({
  containerElement,
  scenarioName,
  vesselName,
  downloadOnly = false,
  format = "jpeg",
  scale = 4.5,
}: {
  containerElement: HTMLElement | null;
  scenarioName: string;
  vesselName?: string;
  downloadOnly?: boolean;
  format?: "png" | "jpeg";
  scale?: number;
}): Promise<boolean> {
  if (!containerElement) {
    toast.error("Visualizador do cais não encontrado para exportação.");
    return false;
  }

  const svgElement = containerElement.querySelector<SVGSVGElement>("svg.blueprint-svg");
  if (!svgElement) {
    toast.error("Desenho do cais não encontrado.");
    return false;
  }

  try {
    const viewBox = svgElement.viewBox.baseVal;
    const origWidth = viewBox.width || svgElement.clientWidth || 1050;
    const origHeight = viewBox.height || svgElement.clientHeight || 420;

    // Escala Ultra HD (4.5x -> ~4725px de largura, qualidade de impressão e telões CCO)
    const exportScale = Math.max(3.5, scale);
    const canvasWidth = Math.round(origWidth * exportScale);
    const canvasHeight = Math.round(origHeight * exportScale);

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      toast.error("Não foi possível inicializar o canvas de alta resolução.");
      return false;
    }

    // Configurações de nitidez e antialiasing profissional
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 1. Fundo do mar/cais (branco sólido para evitar artefatos em JPEG)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Serializar o SVG do blueprint com injeção de CSS
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(canvasWidth));
    svgClone.setAttribute("height", String(canvasHeight));

    // Coleta todas as regras CSS ativas para que as fontes, espessuras e cores fiquem idênticas
    let allCss = "";
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            allCss += rule.cssText + "\n";
          }
        } catch {}
      }
    } catch {}

    const styleTag = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleTag.textContent = allCss;
    svgClone.insertBefore(styleTag, svgClone.firstChild);

    const svgXml = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgXml], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const svgImg = new Image();
    await new Promise<void>((resolve, reject) => {
      svgImg.onload = () => resolve();
      svgImg.onerror = (e) => reject(e);
      svgImg.src = svgUrl;
    });

    ctx.drawImage(svgImg, 0, 0, canvasWidth, canvasHeight);
    URL.revokeObjectURL(svgUrl);

    // 3. Desenhar a Logo da empresa no canto superior esquerdo em alta resolução
    try {
      const logoImg = new Image();
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
        logoImg.src = "/logo.png";
      });

      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
        const targetHeight = Math.round(38 * exportScale);
        const targetWidth = Math.round(targetHeight * logoAspect);
        ctx.drawImage(
          logoImg,
          Math.round(20 * exportScale),
          Math.round(14 * exportScale),
          targetWidth,
          targetHeight
        );
      }
    } catch (logoErr) {
      console.warn("Logo overlay ignorado:", logoErr);
    }

    // 4. Marca d'água técnica de alta resolução no canto superior direito
    try {
      const paddingX = Math.round(20 * exportScale);
      const paddingY = Math.round(20 * exportScale);
      const fontSize = Math.round(7.5 * exportScale);
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = "#0f2331";
      ctx.textAlign = "right";
      ctx.fillText("PLANO DE ATRACAÇÃO · TERMINAL RIO", canvasWidth - paddingX, paddingY + fontSize);

      const subFontSize = Math.round(5.5 * exportScale);
      ctx.font = `600 ${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = "#55707d";
      const nowStr = new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      ctx.fillText(`Gerado em ${nowStr} · Ultra HD (${canvasWidth} × ${canvasHeight} px)`, canvasWidth - paddingX, paddingY + fontSize + subFontSize + 4 * exportScale);
    } catch {}

    // 5. Gerar Blob em Alta Qualidade (JPEG com 98% de qualidade ou PNG)
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    const fileExt = format === "jpeg" ? "jpg" : "png";
    const quality = format === "jpeg" ? 0.98 : undefined;

    return await new Promise<boolean>((resolve) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            toast.error("Falha ao gerar o arquivo de imagem.");
            resolve(false);
            return;
          }

          const rawTitle = vesselName || scenarioName || "plano-atracacao";
          const safeName = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
          const fileName = `atracacao-${safeName}-ultrahd.${fileExt}`;
          const file = new File([blob], fileName, { type: mimeType });

          // Tamanho formatado em MB ou KB para exibição informativa
          const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
          const fileSizeKB = (blob.size / 1024).toFixed(0);
          const sizeText = blob.size >= 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;

          // Tentar compartilhar nativamente pelo sistema (se o usuário estiver no WhatsApp ou mobile/Windows e NÃO for download direto)
          let sharedNatively = false;
          if (!downloadOnly && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: `Plano de Atracação · ${rawTitle}`,
                text: `Plano de atracação oficial em Ultra Alta Resolução (${canvasWidth}x${canvasHeight}px, ${sizeText})`,
              });
              sharedNatively = true;
            } catch (err: any) {
              if (err.name !== "AbortError") {
                console.warn("Compartilhamento nativo cancelado:", err);
              }
            }
          }

          // Se for downloadOnly ou não compartilhou via janela nativa, faz o download automático
          if (downloadOnly || !sharedNatively) {
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
          }

          // Copiar para a área de transferência se suportado
          let copiedToClipboard = false;
          try {
            if (navigator.clipboard && window.ClipboardItem && mimeType === "image/png") {
              await navigator.clipboard.write([
                new ClipboardItem({
                  "image/png": blob,
                }),
              ]);
              copiedToClipboard = true;
            }
          } catch (clipErr) {
            console.warn("Clipboard write:", clipErr);
          }

          if (downloadOnly) {
            toast.success(`Imagem salva com sucesso! Resolução Ultra HD: ${canvasWidth}×${canvasHeight}px (${sizeText}).`);
          } else if (sharedNatively) {
            toast.success("Plano compartilhado com sucesso!");
          } else if (copiedToClipboard) {
            toast.success(`Imagem Ultra HD (${canvasWidth}×${canvasHeight}px, ${sizeText}) baixada e copiada para a área de transferência!`);
          } else {
            toast.success(`Imagem Ultra HD baixada com sucesso (${canvasWidth}×${canvasHeight}px, ${sizeText})!`);
          }

          resolve(true);
        },
        mimeType,
        quality
      );
    });
  } catch (error) {
    console.error("Erro ao exportar imagem do cais:", error);
    toast.error("Erro ao gerar imagem em alta definição.");
    return false;
  }
}
