"use strict";

const fs = require("fs");
const acorn = require("acorn");
const walk = require("acorn-walk");

function parseFileAST(filePath) {
  try {
    const code = fs.readFileSync(filePath, "utf-8");
    // Gunakan parser termodern agar syntax async/await & ES Module terdukung
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", locations: true });
    
    const symbols = [];
    
    walk.simple(ast, {
      FunctionDeclaration(node) {
        if (node.id) {
          symbols.push({
            type: "function",
            name: node.id.name,
            code: code.slice(node.start, node.end),
            loc: node.loc
          });
        }
      },
      ClassDeclaration(node) {
        if (node.id) {
          symbols.push({
            type: "class",
            name: node.id.name,
            code: code.slice(node.start, node.end),
            loc: node.loc
          });
        }
      },
      VariableDeclarator(node) {
        if (node.id && node.init && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
          symbols.push({
            type: "function-var",
            name: node.id.name,
            code: code.slice(node.start, node.end),
            loc: node.loc
          });
        }
      },
      MethodDefinition(node) {
        if (node.key) {
          symbols.push({
            type: "method",
            name: node.key.name,
            code: code.slice(node.start, node.end),
            loc: node.loc
          });
        }
      }
    });
    
    return { success: true, symbols };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getSymbolCode(filePath, symbolName) {
  const result = parseFileAST(filePath);
  if (!result.success) return result;
  
  const found = result.symbols.filter(s => s.name === symbolName);
  if (found.length === 0) return { success: false, error: `Symbol '${symbolName}' tidak ditemukan di ${filePath}` };
  
  return { success: true, data: found };
}

function getFileSummary(filePath) {
  const result = parseFileAST(filePath);
  if (!result.success) return result;
  
  const summary = result.symbols.map(s => `- [${s.type}] ${s.name} (Baris ${s.loc.start.line}-${s.loc.end.line})`);
  return { success: true, summary: summary.length > 0 ? summary.join("\n") : "Tidak ada fungsi/class spesifik yang terdeteksi." };
}

module.exports = { parseFileAST, getSymbolCode, getFileSummary };
