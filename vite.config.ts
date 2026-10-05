import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { publicPlatformScript } from "./server/_core/publicConfig";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Static development and static publishing use the same public-value whitelist
// as Express. Runtime-only secrets never enter the browser bundle. Express keeps
// serving this path dynamically when the application server is selected.
function vitePluginPublicPlatformConfig(): Plugin {
  return {
    name: "manus-public-platform-config",
    configureServer(server) {
      server.middlewares.use("/api/platform/config.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(publicPlatformScript());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "api/platform/config.js", source: publicPlatformScript() });
    },
  };
}

function vitePluginPraticagemApi(): Plugin {
  return {
    name: "praticagem-api",
    configureServer(server) {
      const publicDir = path.resolve(PROJECT_ROOT, "client", "public");
      const catalogPath = path.join(publicDir, "vessels_catalog.json");
      const livePath = path.join(publicDir, "praticagem_live.json");
      const pythonScript = path.resolve(PROJECT_ROOT, "scripts", "sync_praticagem.py");
      const venvPython = "D:\\Programação\\praticagem_dashboard\\scraper\\venv\\Scripts\\python.exe";
      const pythonExe = fs.existsSync(venvPython) ? `"${venvPython}"` : "python";

      // GET /api/praticagem/live
      server.middlewares.use("/api/praticagem/live", (req, res, next) => {
        if (req.method !== "GET") return next();
        if (fs.existsSync(livePath)) {
          const content = fs.readFileSync(livePath, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(content);
        } else {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ updatedAt: "", count: 0, maneuvers: [] }));
        }
      });

      // POST /api/praticagem/sync
      server.middlewares.use("/api/praticagem/sync", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const { createRequire } = await import("node:module");
          const customRequire = createRequire(import.meta.url);
          const { syncPraticagem } = customRequire("./electron/praticagem-sync.cjs");
          const result = await syncPraticagem(publicDir, PROJECT_ROOT, () => {});
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ status: "success", maneuversCount: result.count }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ status: "error", message: String(err) }));
        }
      });

      // /api/catalog/vessels
      server.middlewares.use("/api/catalog/vessels", (req, res, next) => {
        const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
        if (req.method === "GET") {
          if (fs.existsSync(catalogPath)) {
            const content = fs.readFileSync(catalogPath, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(content);
          } else {
            res.setHeader("Content-Type", "application/json");
            res.end("[]");
          }
          return;
        }

        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const newVessel = JSON.parse(body);
              let list = [];
              if (fs.existsSync(catalogPath)) {
                try {
                  list = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
                } catch {}
              }
              const map = new Map(list.map((v: any) => [v.name.toUpperCase(), v]));
              map.set(newVessel.name.toUpperCase(), newVessel);
              const updated = Array.from(map.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
              fs.writeFileSync(catalogPath, JSON.stringify(updated, null, 2), "utf-8");
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(updated));
            } catch (e) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
          return;
        }

        if (req.method === "DELETE") {
          const nameToDelete = url.searchParams.get("name")?.toUpperCase();
          if (!nameToDelete) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing name" }));
            return;
          }
          let list = [];
          if (fs.existsSync(catalogPath)) {
            try {
              list = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
            } catch {}
          }
          const updated = list.filter((v: any) => v.name.toUpperCase() !== nameToDelete);
          fs.writeFileSync(catalogPath, JSON.stringify(updated, null, 2), "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(updated));
          return;
        }

        next();
      });
    },
  };
}

const plugins = [
  vitePluginPublicPlatformConfig(),
  vitePluginPraticagemApi(),
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusDebugCollector(),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
