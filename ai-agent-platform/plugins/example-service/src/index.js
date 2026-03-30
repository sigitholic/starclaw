"use strict";

/**
 * Example Service Plugin — Starclaw AI Agent Platform
 *
 * Ini adalah contoh plugin tipe SERVICE yang berjalan sebagai HTTP server
 * terpisah dari core Starclaw.
 *
 * Struktur:
 *   plugins/example-service/
 *     plugin.json        ← manifest: type=service, port, configSchema
 *     package.json       ← scripts.start wajib ada
 *     src/
 *       index.js         ← entry point (file ini)
 *
 * Cara menjalankan via Starclaw:
 *   /plugin run example-service
 *   atau via agent: "jalankan plugin example-service"
 *
 * Starclaw akan:
 *   1. Validasi package.json ada scripts.start
 *   2. Inject config dari data/plugin-configs/example-service/config.json
 *   3. Spawn: node src/index.js
 *   4. Monitor output dan port
 */

const http = require("http");

const PORT = parseInt(process.env.PORT || "5110", 10);
const PLUGIN_NAME = process.env.PLUGIN_NAME || "example-service";
const API_KEY = process.env.SERVICE_API_KEY || null;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Auth check (jika API key dikonfigurasi)
  if (API_KEY) {
    const authHeader = req.headers["authorization"] || "";
    if (!authHeader.includes(API_KEY)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Routes
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ok",
      plugin: PLUGIN_NAME,
      port: PORT,
      uptime: Math.floor(process.uptime()),
      version: "1.0.0",
    }));
    return;
  }

  if (req.url === "/info" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({
      name: PLUGIN_NAME,
      type: "service",
      description: "Contoh plugin service untuk Starclaw",
      endpoints: ["/health", "/info", "/execute"],
    }));
    return;
  }

  if (req.url === "/execute" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const action = payload.action || "ping";

        // Implementasi action di sini
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          action,
          result: `Plugin '${PLUGIN_NAME}' mengeksekusi action: ${action}`,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  // Output yang bisa di-parse oleh ProcessManager untuk deteksi port
  console.log(`[${PLUGIN_NAME}] Service berjalan di http://localhost:${PORT}`);
  console.log(`[${PLUGIN_NAME}] Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log(`[${PLUGIN_NAME}] Menerima SIGTERM, shutdown...`);
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
