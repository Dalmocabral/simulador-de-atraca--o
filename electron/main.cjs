const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { syncPraticagem } = require("./praticagem-sync.cjs");

let splashWindow = null;
let mainWindow = null;
let serverInstance = null;
let serverPort = 4173;

/**
 * Servidor HTTP embutido para servir os arquivos estáticos de dist/
 * e fornecer as rotas da Praticagem e catálogo localmente.
 */
function startInternalServer(rootDir) {
  return new Promise((resolve) => {
    const userDataDir = app.getPath("userData");
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const publicDir = path.join(rootDir, "client", "public");
    const distDir = path.join(rootDir, "dist", "public");
    const catalogPath = path.join(userDataDir, "vessels_catalog.json");
    const livePath = path.join(userDataDir, "praticagem_live.json");

    // Semente inicial de catálogo e manobras caso ainda não existam no userData
    const bundledCatalog = path.join(publicDir, "vessels_catalog.json");
    const bundledLive = path.join(publicDir, "praticagem_live.json");

    if (!fs.existsSync(catalogPath) && fs.existsSync(bundledCatalog)) {
      try { fs.copyFileSync(bundledCatalog, catalogPath); } catch {}
    }
    if (!fs.existsSync(livePath) && fs.existsSync(bundledLive)) {
      try { fs.copyFileSync(bundledLive, livePath); } catch {}
    }

    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    serverInstance = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${serverPort}`);
      const pathname = decodeURIComponent(url.pathname);

      // 1. API: /api/praticagem/live
      if (pathname === "/api/praticagem/live") {
        if (fs.existsSync(livePath)) {
          const content = fs.readFileSync(livePath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(content);
        } else if (fs.existsSync(bundledLive)) {
          const content = fs.readFileSync(bundledLive, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(content);
        } else {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ updatedAt: "", count: 0, maneuvers: [] }));
        }
        return;
      }

      // 2. API: /api/praticagem/sync
      if (pathname === "/api/praticagem/sync" && req.method === "POST") {
        syncPraticagem(userDataDir, rootDir, () => {})
          .then(() => {
            let count = 0;
            if (fs.existsSync(livePath)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(livePath, "utf-8"));
                count = parsed.count || 0;
              } catch {}
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ status: "success", maneuversCount: count }));
          })
          .catch((err) => {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ status: "error", message: String(err) }));
          });
        return;
      }

      // 3. API: /api/catalog/vessels
      if (pathname === "/api/catalog/vessels") {
        if (req.method === "GET") {
          const target = fs.existsSync(catalogPath) ? catalogPath : bundledCatalog;
          if (fs.existsSync(target)) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(fs.readFileSync(target, "utf-8"));
          } else {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end("[]");
          }
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const newVessel = JSON.parse(body);
              let list = [];
              if (fs.existsSync(catalogPath)) {
                list = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
              } else if (fs.existsSync(bundledCatalog)) {
                list = JSON.parse(fs.readFileSync(bundledCatalog, "utf-8"));
              }
              const idx = list.findIndex((item) => item.name.toUpperCase() === newVessel.name.toUpperCase());
              if (idx >= 0) {
                list[idx] = { ...list[idx], ...newVessel };
              } else {
                list.push(newVessel);
              }
              fs.writeFileSync(catalogPath, JSON.stringify(list, null, 2), "utf-8");
              res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ status: "success" }));
            } catch (err) {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ status: "error", message: String(err) }));
            }
          });
          return;
        }
      }

      // 4. Arquivos estáticos (dist/public ou client/public)
      let filePath = path.join(distDir, pathname === "/" ? "index.html" : pathname);

      // Fallback para SPA se não existir o arquivo exato
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const publicFallback = path.join(publicDir, pathname);
        if (fs.existsSync(publicFallback) && !fs.statSync(publicFallback).isDirectory()) {
          filePath = publicFallback;
        } else {
          filePath = path.join(distDir, "index.html");
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Arquivo não encontrado.");
        } else {
          res.writeHead(200, { "Content-Type": contentType });
          res.end(data);
        }
      });
    });

    serverInstance.listen(0, "127.0.0.1", () => {
      serverPort = serverInstance.address().port;
      console.log(`[Electron Server] Rodando internamente na porta ${serverPort}`);
      resolve(serverPort);
    });
  });
}

/**
 * Cria a janela de Splash (carregamento inicial)
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 310,
    frame: false,
    transparent: true,
    center: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => {
    splashWindow.show();
  });
}

/**
 * Cria a janela principal do Simulador
 */
function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: "CaisLab · Simulador de Atracação",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.maximize();

  // Permite controle de zoom global da interface via Ctrl+, Ctrl-, Ctrl+0
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control || input.meta) {
      if (input.key === "=" || input.key === "+") {
        const current = mainWindow.webContents.getZoomFactor();
        mainWindow.webContents.setZoomFactor(Math.min(3.0, Number((current + 0.1).toFixed(2))));
        event.preventDefault();
      } else if (input.key === "-") {
        const current = mainWindow.webContents.getZoomFactor();
        mainWindow.webContents.setZoomFactor(Math.max(0.6, Number((current - 0.1).toFixed(2))));
        event.preventDefault();
      } else if (input.key === "0") {
        mainWindow.webContents.setZoomFactor(1.0);
        event.preventDefault();
      }
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send("splash-update", {
        message: "Tudo pronto! Abrindo centro de operações...",
        progress: 100,
      });

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          splashWindow = null;
        }
        mainWindow.show();
      }, 700);
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createSplashWindow();

  const rootDir = path.resolve(__dirname, "..");
  const userDataDir = app.getPath("userData");
  const port = await startInternalServer(rootDir);

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash-update", {
      message: "Serviço interno pronto. Conectando à Praticagem RJ...",
      progress: 30,
    });
  }

  // Sincronização em background da Praticagem RJ
  await syncPraticagem(userDataDir, rootDir, (msg, pct) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send("splash-update", {
        message: msg,
        progress: pct,
      });
    }
  });

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash-update", {
      message: "Carregando simulador visual...",
      progress: 92,
    });
  }

  createMainWindow(port);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(serverPort);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});
