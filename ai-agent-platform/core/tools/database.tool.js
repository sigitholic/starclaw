"use strict";

/**
 * Database Tool — Query dan simpan data ke SQLite lokal.
 *
 * SQLite dipilih karena:
 *   - Zero configuration — tidak butuh server database
 *   - File-based — bisa commit ke git, mudah backup
 *   - Cukup untuk data agent (memory jangka panjang terstruktur, log, dll)
 *
 * Menggunakan better-sqlite3 (sync API, lebih simpel untuk agent).
 * Jika tidak tersedia, fallback ke JSON file storage.
 *
 * Environment variables:
 *   DATABASE_PATH — Path file SQLite (default: data/starclaw.db)
 */
function createDatabaseTool() {
  const path = require("path");
  const fs = require("fs");

  const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data/starclaw.db");

  // Lazy-load better-sqlite3 agar tidak error jika tidak terinstall
  let db = null;
  let useFallback = false;

  function getDb() {
    if (db) return db;
    try {
      const Database = require("better-sqlite3");
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      db = new Database(DB_PATH);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      return db;
    } catch (_) {
      useFallback = true;
      return null;
    }
  }

  // JSON fallback jika better-sqlite3 tidak ada
  const FALLBACK_PATH = path.join(process.cwd(), "data/agent-database.json");
  function getFallbackData() {
    try {
      const dir = path.dirname(FALLBACK_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(FALLBACK_PATH)) return { tables: {} };
      return JSON.parse(fs.readFileSync(FALLBACK_PATH, "utf-8"));
    } catch { return { tables: {} }; }
  }
  function saveFallbackData(data) {
    fs.writeFileSync(FALLBACK_PATH, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    name: "database-tool",
    description: "Query dan simpan data ke database lokal (SQLite). Gunakan untuk menyimpan data terstruktur yang perlu diquery, seperti daftar perangkat, log task, kontak, konfigurasi. Mendukung create table, insert, select, update, delete.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'query' (SQL SELECT bebas), 'execute' (SQL INSERT/UPDATE/DELETE/CREATE), 'insert' (insert row mudah), 'select' (select dengan filter), 'tables' (list semua tabel), 'describe' (struktur tabel)"
        },
        sql: {
          type: "string",
          description: "(untuk query/execute) Statement SQL lengkap"
        },
        table: {
          type: "string",
          description: "(untuk insert/select) Nama tabel"
        },
        data: {
          type: "object",
          description: "(untuk insert) Object key-value data yang ingin di-insert"
        },
        where: {
          type: "object",
          description: "(untuk select) Kondisi filter: { kolom: nilai }"
        },
        limit: {
          type: "number",
          description: "(untuk select) Batas jumlah baris (default: 50)"
        },
        params: {
          type: "array",
          description: "(untuk query/execute) Parameter untuk prepared statement (opsional)"
        },
      },
      required: ["action"],
    },

    async run(input) {
      try {
        const database = getDb();

        // === FALLBACK MODE (JSON) jika SQLite tidak tersedia ===
        if (useFallback || !database) {
          const store = getFallbackData();

          if (input.action === "tables") {
            return { success: true, tables: Object.keys(store.tables), note: "Mode JSON fallback (better-sqlite3 tidak terinstall)" };
          }

          if (input.action === "insert" && input.table && input.data) {
            if (!store.tables[input.table]) store.tables[input.table] = [];
            const row = { ...input.data, _id: Date.now(), _at: new Date().toISOString() };
            store.tables[input.table].push(row);
            saveFallbackData(store);
            return { success: true, inserted: row, note: "Mode JSON fallback" };
          }

          if (input.action === "select" && input.table) {
            const rows = store.tables[input.table] || [];
            let results = rows;
            if (input.where) {
              results = rows.filter(row =>
                Object.entries(input.where).every(([k, v]) => row[k] === v)
              );
            }
            return { success: true, rows: results.slice(0, input.limit || 50), total: results.length, note: "Mode JSON fallback" };
          }

          return { success: false, error: "Mode JSON fallback: hanya mendukung insert, select, tables. Install better-sqlite3 untuk SQL penuh: npm install better-sqlite3" };
        }

        // === SQLITE MODE ===
        switch (input.action) {

          case "tables": {
            const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
            return { success: true, tables: tables.map(t => t.name) };
          }

          case "describe": {
            if (!input.table) return { success: false, error: "table wajib untuk describe" };
            const cols = database.prepare(`PRAGMA table_info(${input.table})`).all();
            return { success: true, table: input.table, columns: cols };
          }

          case "query": {
            if (!input.sql) return { success: false, error: "sql wajib untuk query" };
            const params = input.params || [];
            const rows = database.prepare(input.sql).all(...params);
            return { success: true, rows, total: rows.length };
          }

          case "execute": {
            if (!input.sql) return { success: false, error: "sql wajib untuk execute" };
            const params = input.params || [];
            const info = database.prepare(input.sql).run(...params);
            return { success: true, changes: info.changes, lastInsertRowid: info.lastInsertRowid };
          }

          case "insert": {
            if (!input.table) return { success: false, error: "table wajib untuk insert" };
            if (!input.data || typeof input.data !== "object") return { success: false, error: "data (object) wajib untuk insert" };

            const cols = Object.keys(input.data);
            const placeholders = cols.map(() => "?").join(", ");
            const values = cols.map(k => input.data[k]);

            // Auto-create table jika belum ada (kolom tipe TEXT semua)
            const createSql = `CREATE TABLE IF NOT EXISTS ${input.table} (${cols.map(c => `${c} TEXT`).join(", ")}, _created_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
            database.prepare(createSql).run();

            const insertSql = `INSERT INTO ${input.table} (${cols.join(", ")}) VALUES (${placeholders})`;
            const info = database.prepare(insertSql).run(...values);
            return { success: true, table: input.table, lastInsertRowid: info.lastInsertRowid, data: input.data };
          }

          case "select": {
            if (!input.table) return { success: false, error: "table wajib untuk select" };

            let sql = `SELECT * FROM ${input.table}`;
            const params = [];

            if (input.where && Object.keys(input.where).length > 0) {
              const conditions = Object.keys(input.where).map(k => `${k} = ?`).join(" AND ");
              sql += ` WHERE ${conditions}`;
              params.push(...Object.values(input.where));
            }

            sql += ` LIMIT ${input.limit || 50}`;

            const rows = database.prepare(sql).all(...params);
            return { success: true, table: input.table, rows, total: rows.length };
          }

          default:
            return { success: false, error: `Action '${input.action}' tidak dikenal. Pilih: query, execute, insert, select, tables, describe` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createDatabaseTool };
