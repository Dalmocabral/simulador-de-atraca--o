import { toast } from "sonner";

export async function exportAndShareBerthImage({
  containerElement,
  scenarioName,
  vesselName,
  downloadOnly = false,
}: {
  containerElement: HTMLElement | null;
  scenarioName: string;
  vesselName?: string;
  downloadOnly?: boolean;
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
    const origWidth = viewBox.width || svgElement.clientWidth || 1100;
    const origHeight = viewBox.height || svgElement.clientHeight || 420;

    // Escala de alta definição (2.5x -> ~2750px de largura, ultra nítida e formato ideal para WhatsApp)
    const exportScale = 2.5;
    const canvasWidth = Math.round(origWidth * exportScale);
    const canvasHeight = Math.round(origHeight * exportScale);

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Não foi possível inicializar o canvas de alta resolução.");
      return false;
    }

    // 1. Fundo do mar/cais
    ctx.fillStyle = "#eef4f7";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Serializar o SVG do blueprint
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(canvasWidth));
    svgClone.setAttribute("height", String(canvasHeight));

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

    // 3. Desenhar a Logo da empresa no canto superior esquerdo (sem bordas e sem sombra)
    try {
      const logoImg = new Image();
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve(); // se não encontrar, continua normalmente
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

    // 4. Gerar Blob em PNG de Alta Qualidade
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
          const fileName = `atracacao-${safeName}.png`;
          const file = new File([blob], fileName, { type: "image/png" });

          // Tentar compartilhar nativamente pelo sistema (se o usuário estiver no WhatsApp ou mobile/Windows e NÃO for download direto)
          let sharedNatively = false;
          if (!downloadOnly && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: `Plano de Atracação · ${rawTitle}`,
                text: `Plano de atracação oficial em alta resolução`,
              });
              sharedNatively = true;
            } catch (err: any) {
              if (err.name !== "AbortError") {
                console.warn("Compartilhamento nativo cancelado ou não suportado:", err);
              }
            }
          }

          // Se for downloadOnly ou não compartilhou via janela nativa, faz o download automático do PNG no PC
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

          // Copiar para a área de transferência para colar diretamente com Ctrl + V no WhatsApp Web ou outros apps
          let copiedToClipboard = false;
          try {
            if (navigator.clipboard && window.ClipboardItem) {
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
            toast.success("Imagem em alta definição salva com sucesso no seu computador!");
          } else if (sharedNatively) {
            toast.success("Plano compartilhado com sucesso!");
          } else if (copiedToClipboard) {
            toast.success("Imagem em alta definição baixada e copiada! Cole (Ctrl+V) direto no WhatsApp.");
          } else {
            toast.success("Imagem em alta definição baixada com sucesso para o WhatsApp!");
          }

          resolve(true);
        },
        "image/png",
        0.98
      );
    });
  } catch (error) {
    console.error("Erro ao exportar imagem do cais:", error);
    toast.error("Erro ao gerar imagem em alta definição.");
    return false;
  }
}
