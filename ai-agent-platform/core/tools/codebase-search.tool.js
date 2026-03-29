"use strict";

const path = require("path");
const { getSymbolCode, getFileSummary } = require("../utils/ast.parser");

function createCodebaseSearchTool() {
  return {
    name: "codebase-search-tool",
    description: "Menganalisa dan mengambil sebagian spesifik kode fungsi/class (AST-Aware Context Selector) dari file JavaScript/TypeScript, mencegah pemborosan Context Window LLM.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'get_summary' (lihat daftar method/fungsi file) atau 'get_symbol' (ambil kode utuh dari variabel/fungsi spesifik)." },
        path: { type: "string", description: "Path dari file kodingan." },
        symbol: { type: "string", description: "(Khusus aksi 'get_symbol') String eksak dari nama Method/Fungsi/Class." }
      },
      required: ["action", "path"]
    },
    async run(input) {
      if (!input.path || !input.action) return { error: "path dan action wajib diisi" };
      
      const targetPath = path.resolve(process.cwd(), input.path);
      
      if (input.action === "get_summary") {
        const result = getFileSummary(targetPath);
        if (!result.success) return { error: result.error };
        return { message: `Gambaran struktur AST file ${input.path}`, summary: result.summary };
      }
      
      if (input.action === "get_symbol") {
        if (!input.symbol) return { error: "Parameter 'symbol' wajib." };
        const result = getSymbolCode(targetPath, input.symbol);
        if (!result.success) return { error: result.error };
        return { message: `Eksplorasi Abstract Syntax Tree berhasil (Hemat token!)`, codeBlocks: result.data };
      }
      
      return { error: "Aksi tidak dikenal, gunakan get_summary atau get_symbol." };
    }
  };
}

module.exports = { createCodebaseSearchTool };
