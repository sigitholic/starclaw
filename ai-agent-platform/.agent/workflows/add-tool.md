---
description: cara menambahkan tool baru ke AI Agent Starclaw
---

## Menambahkan Tool Baru

### Langkah 1: Buat File Tool

Buat file baru di `core/tools/` dengan format:

```javascript
// core/tools/nama-tool.tool.js
"use strict";

function createNamaToolTool() {
  return {
    name: "nama-tool",          // id unik, dipakai LLM untuk memilih tool ini
    description: "Deskripsi singkat fungsi tool ini untuk LLM.",
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string", description: "Penjelasan parameter 1" },
        param2: { type: "number", description: "Penjelasan parameter 2" }
      },
      required: ["param1"]
    },
    async run(input) {
      try {
        // Implementasi logika tool di sini
        const result = await doSomething(input.param1);
        return { success: true, result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };
}

module.exports = { createNamaToolTool };
```

### Langkah 2: Daftarkan Tool di Registry

Edit `core/tools/index.js` dan tambahkan tool baru:

```javascript
const { createNamaToolTool } = require("./nama-tool.tool");

// Di dalam createToolsRegistry():
registry.register(createNamaToolTool());
```

### Langkah 3: Verifikasi Tool Terdeteksi LLM

Cek bahwa schema tool muncul di prompt LLM:

```bash
node -e "
const { createToolsRegistry } = require('./core/tools/index');
const reg = createToolsRegistry();
console.log(JSON.stringify(reg.getToolSchemas(), null, 2));
"
```

### Langkah 4: Test Tool Baris Demi Baris

```bash
node -e "
const { createNamaToolTool } = require('./core/tools/nama-tool.tool');
const tool = createNamaToolTool();
tool.run({ param1: 'test value' }).then(console.log);
"
```

### Aturan Penting untuk Tool
- `run()` **harus** mengembalikan object, bukan throw error (kembalikan `{ success: false, error }`)
- Batasi output ke maksimal 3000 karakter (agar tidak overflow context LLM)
- Sertakan deskripsi parameter yang jelas — LLM membaca ini untuk memilih tool yang tepat
- Tambahkan tool ke long memory jika menghasilkan data penting: `memory.long.put(key, result)`
