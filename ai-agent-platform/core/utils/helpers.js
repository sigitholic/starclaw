"use strict";

const http = require("http");

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        resolve({ raw });
      }
    });
  });
}

function createHttpServer(handler) {
  return http.createServer(async (req, res) => {
    const body = await parseBody(req);
    const result = await handler(req, res, body);

    res.writeHead(result.statusCode || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.payload || {}));
  });
}

module.exports = { createHttpServer };
