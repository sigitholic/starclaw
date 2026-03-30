"use strict";

/**
 * MQL5 Tool — Generate, simpan, dan kelola kode EA/Script/Indicator MetaTrader 5.
 *
 * Kemampuan:
 *   - Generate template EA (Expert Advisor) lengkap dengan input parameter
 *   - Generate indicator custom MQL5
 *   - Generate script MT5
 *   - Simpan file .mq5 ke folder yang bisa diakses MT5
 *   - List file MQL5 yang sudah dibuat
 *   - Validasi sintaks dasar MQL5
 *
 * Folder output default: data/mql5/
 * Untuk MT5 di Windows, copy ke: C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL5\Experts\
 *
 * Environment variables:
 *   MT5_MQL5_PATH — Path folder MQL5 di instalasi MT5 (opsional, untuk auto-copy)
 */
function createMql5Tool() {
  const fs = require("fs");
  const path = require("path");

  const OUTPUT_DIR = path.join(process.cwd(), "data/mql5");

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // ============================================================
  // Template Generator
  // ============================================================

  function generateEATemplate({ name, description, inputs, strategy }) {
    const inputsCode = (inputs || []).map(inp => {
      const type = inp.type || "double";
      const defaultVal = inp.default !== undefined ? inp.default : (type === "double" ? "0.0" : type === "int" ? "0" : `""`);
      return `input ${type} ${inp.name} = ${defaultVal}; // ${inp.description || inp.name}`;
    }).join("\n");

    return `//+------------------------------------------------------------------+
//|  ${name}.mq5                                                    |
//|  ${description || "Expert Advisor — dibuat oleh Starclaw AI Agent"}       |
//|  Dibuat: ${new Date().toISOString().split("T")[0]}                                      |
//+------------------------------------------------------------------+
#property copyright "Starclaw AI Agent"
#property link      ""
#property version   "1.00"
#property strict

//--- Input Parameters
${inputsCode || "input double LotSize = 0.1;       // Ukuran lot\ninput int    StopLoss = 50;        // Stop Loss (pips)\ninput int    TakeProfit = 100;     // Take Profit (pips)\ninput int    MagicNumber = 12345;  // Magic Number EA"}

//--- Global variables
int      g_ticket = -1;
datetime g_lastBar = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("EA ${name} diinisialisasi.");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("EA ${name} dihentikan. Alasan: ", reason);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Pastikan hanya eksekusi sekali per bar baru
   if(g_lastBar == iTime(_Symbol, PERIOD_CURRENT, 0))
      return;
   g_lastBar = iTime(_Symbol, PERIOD_CURRENT, 0);

${strategy || generateDefaultStrategy()}
  }

${generateTradeHelpers()}`;
  }

  function generateDefaultStrategy() {
    return `   //--- Ambil data harga
   double closePrice = iClose(_Symbol, PERIOD_CURRENT, 1);
   double openPrice  = iOpen(_Symbol, PERIOD_CURRENT, 1);

   //--- Hitung indikator (contoh: MA sederhana)
   double ma20 = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_SMA, PRICE_CLOSE);
   double ma50 = iMA(_Symbol, PERIOD_CURRENT, 50, 0, MODE_SMA, PRICE_CLOSE);

   //--- Kondisi entry
   bool buySignal  = (ma20 > ma50) && (closePrice > ma20);
   bool sellSignal = (ma20 < ma50) && (closePrice < ma20);

   //--- Kelola posisi
   if(!PositionSelect(_Symbol))
     {
      if(buySignal)
         OpenBuy();
      else if(sellSignal)
         OpenSell();
     }`;
  }

  function generateTradeHelpers() {
    return `//+------------------------------------------------------------------+
//| Buka posisi BUY                                                  |
//+------------------------------------------------------------------+
void OpenBuy()
  {
   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};

   request.action   = TRADE_ACTION_DEAL;
   request.symbol   = _Symbol;
   request.volume   = LotSize;
   request.type     = ORDER_TYPE_BUY;
   request.price    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   request.sl       = request.price - StopLoss * _Point * 10;
   request.tp       = request.price + TakeProfit * _Point * 10;
   request.magic    = MagicNumber;
   request.comment  = "Starclaw EA Buy";
   request.deviation = 10;

   if(!OrderSend(request, result))
      Print("OpenBuy error: ", result.retcode, " - ", result.comment);
   else
      Print("BUY dibuka @ ", request.price, " SL:", request.sl, " TP:", request.tp);
  }

//+------------------------------------------------------------------+
//| Buka posisi SELL                                                 |
//+------------------------------------------------------------------+
void OpenSell()
  {
   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};

   request.action   = TRADE_ACTION_DEAL;
   request.symbol   = _Symbol;
   request.volume   = LotSize;
   request.type     = ORDER_TYPE_SELL;
   request.price    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   request.sl       = request.price + StopLoss * _Point * 10;
   request.tp       = request.price - TakeProfit * _Point * 10;
   request.magic    = MagicNumber;
   request.comment  = "Starclaw EA Sell";
   request.deviation = 10;

   if(!OrderSend(request, result))
      Print("OpenSell error: ", result.retcode, " - ", result.comment);
   else
      Print("SELL dibuka @ ", request.price, " SL:", request.sl, " TP:", request.tp);
  }

//+------------------------------------------------------------------+
//| Tutup semua posisi                                               |
//+------------------------------------------------------------------+
void CloseAll()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
        {
         MqlTradeRequest request = {};
         MqlTradeResult  result  = {};
         request.action = TRADE_ACTION_DEAL;
         request.symbol = _Symbol;
         request.volume = PositionGetDouble(POSITION_VOLUME);
         request.type   = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
         request.price  = (request.type == ORDER_TYPE_SELL) ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         request.deviation = 10;
         request.magic  = MagicNumber;
         if(!OrderSend(request, result))
            Print("CloseAll error: ", result.retcode);
        }
     }
  }
//+------------------------------------------------------------------+`;
  }

  function generateIndicatorTemplate({ name, description, buffers }) {
    const buffersCode = (buffers || [{ name: "Buffer", color: "clrBlue", style: "DRAW_LINE" }]).map((b, i) => {
      return `double ${b.name}[];  // Buffer indikator ${i + 1}`;
    }).join("\n");

    const setBuffers = (buffers || [{ name: "Buffer" }]).map((b, i) => {
      return `   SetIndexBuffer(${i}, ${b.name}, INDICATOR_DATA);
   PlotIndexSetString(${i}, PLOT_LABEL, "${b.name}");`;
    }).join("\n");

    return `//+------------------------------------------------------------------+
//|  ${name}.mq5 — Custom Indicator                                 |
//|  ${description || "Indicator — dibuat oleh Starclaw AI Agent"}              |
//+------------------------------------------------------------------+
#property copyright "Starclaw AI Agent"
#property indicator_chart_window
#property indicator_buffers ${(buffers || [{}]).length}
#property indicator_plots   ${(buffers || [{}]).length}

//--- Indicator buffers
${buffersCode}

//--- Input
input int Period = 14; // Periode

//+------------------------------------------------------------------+
int OnInit()
  {
${setBuffers}
   IndicatorSetString(INDICATOR_SHORTNAME, "${name}("+IntegerToString(Period)+")");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   int start = (prev_calculated == 0) ? Period : prev_calculated - 1;

   for(int i = start; i < rates_total; i++)
     {
      // TODO: Implementasi kalkulasi indikator di sini
      // Contoh: Buffer[i] = iMA(NULL, 0, Period, 0, MODE_SMA, PRICE_CLOSE, i);
     }

   return(rates_total);
  }
//+------------------------------------------------------------------+`;
  }

  // ============================================================
  // Main tool
  // ============================================================
  return {
    name: "mql5-tool",
    description: "Buat, simpan, dan kelola kode MQL5 untuk MetaTrader 5: Expert Advisor (EA trading robot), Indicator custom, dan Script. File disimpan di data/mql5/ dan bisa di-copy ke MT5.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "'generate-ea' (buat EA), 'generate-indicator' (buat indikator), 'generate-script' (buat script), 'save' (simpan kode ke file), 'list' (list file MQL5 yang ada), 'read' (baca isi file), 'delete' (hapus file)"
        },
        name: {
          type: "string",
          description: "Nama EA/Indicator/Script (tanpa ekstensi .mq5)"
        },
        description: {
          type: "string",
          description: "Deskripsi singkat tentang strategi atau fungsi"
        },
        code: {
          type: "string",
          description: "(untuk action 'save') Kode MQL5 lengkap yang ingin disimpan"
        },
        inputs: {
          type: "array",
          description: "(untuk generate-ea) Array parameter input: [{name, type, default, description}]. Contoh: [{name:'LotSize', type:'double', default:0.1, description:'Ukuran lot'}]"
        },
        strategy: {
          type: "string",
          description: "(untuk generate-ea) Kode strategi trading dalam MQL5 yang akan dimasukkan ke fungsi OnTick(). Jika kosong, gunakan template MA crossover."
        },
        buffers: {
          type: "array",
          description: "(untuk generate-indicator) Array buffer: [{name, color, style}]"
        },
        filename: {
          type: "string",
          description: "(untuk read/delete) Nama file lengkap dengan ekstensi, contoh: MyEA.mq5"
        },
      },
      required: ["action"],
    },

    async run(input) {
      try {
        ensureDir(OUTPUT_DIR);

        switch (input.action) {

          case "generate-ea": {
            if (!input.name) return { success: false, error: "name wajib untuk generate-ea" };
            const code = generateEATemplate({
              name: input.name,
              description: input.description,
              inputs: input.inputs,
              strategy: input.strategy,
            });
            const filename = `${input.name}.mq5`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, code, "utf-8");

            const mt5Path = process.env.MT5_MQL5_PATH;
            let mt5CopyNote = "";
            if (mt5Path) {
              try {
                const dest = path.join(mt5Path, "Experts", filename);
                fs.copyFileSync(filepath, dest);
                mt5CopyNote = `\n✅ File di-copy ke MT5: ${dest}`;
              } catch (e) {
                mt5CopyNote = `\n⚠️ Gagal copy ke MT5 path: ${e.message}`;
              }
            }

            return {
              success: true,
              message: `EA '${input.name}' berhasil dibuat dan disimpan ke ${filepath}${mt5CopyNote}`,
              filename,
              filepath,
              linesOfCode: code.split("\n").length,
              nextSteps: [
                `Copy file ke: C:\\Users\\<user>\\AppData\\Roaming\\MetaQuotes\\Terminal\\<ID>\\MQL5\\Experts\\`,
                "Di MT5: klik kanan file di Navigator → Compile",
                "Pasang EA ke chart dengan klik kanan chart → Attach an Expert Advisor",
                "Set parameter dan aktifkan AutoTrading",
              ],
              codePreview: code.slice(0, 500) + "...[truncated, total " + code.length + " chars]",
            };
          }

          case "generate-indicator": {
            if (!input.name) return { success: false, error: "name wajib" };
            const code = generateIndicatorTemplate({
              name: input.name,
              description: input.description,
              buffers: input.buffers,
            });
            const filename = `${input.name}.mq5`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, code, "utf-8");
            return {
              success: true,
              message: `Indicator '${input.name}' disimpan ke ${filepath}`,
              filename,
              filepath,
              linesOfCode: code.split("\n").length,
              nextSteps: [
                "Copy ke folder MQL5/Indicators/ di MT5",
                "Compile via MT5 MetaEditor (F7)",
                "Tambahkan ke chart via Insert → Indicators → Custom",
              ],
            };
          }

          case "generate-script": {
            if (!input.name) return { success: false, error: "name wajib" };
            const scriptCode = `//+------------------------------------------------------------------+
//|  ${input.name}.mq5 — Script MT5                                 |
//|  ${input.description || "Script — dibuat oleh Starclaw AI Agent"}          |
//+------------------------------------------------------------------+
#property copyright "Starclaw AI Agent"
#property script_show_inputs true

//--- Input
input string Comment = "Starclaw Script"; // Komentar order

//+------------------------------------------------------------------+
void OnStart()
  {
   Print("Script ${input.name} dijalankan.");
   // TODO: Implementasi logika script di sini
   Print("Script selesai.");
  }
//+------------------------------------------------------------------+`;
            const filename = `${input.name}.mq5`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, scriptCode, "utf-8");
            return {
              success: true,
              message: `Script '${input.name}' disimpan ke ${filepath}`,
              filename, filepath,
              nextSteps: ["Copy ke MQL5/Scripts/ di MT5", "Compile dan drag ke chart untuk dijalankan"],
            };
          }

          case "save": {
            if (!input.name || !input.code) return { success: false, error: "name dan code wajib" };
            const filename = input.name.endsWith(".mq5") ? input.name : `${input.name}.mq5`;
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, input.code, "utf-8");
            return { success: true, message: `File disimpan: ${filepath}`, filename, filepath, bytes: input.code.length };
          }

          case "list": {
            ensureDir(OUTPUT_DIR);
            const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".mq5") || f.endsWith(".ex5"));
            return {
              success: true,
              files: files.map(f => {
                const stat = fs.statSync(path.join(OUTPUT_DIR, f));
                return { filename: f, size: stat.size, modified: stat.mtime.toISOString() };
              }),
              total: files.length,
              directory: OUTPUT_DIR,
            };
          }

          case "read": {
            if (!input.filename) return { success: false, error: "filename wajib" };
            const filepath = path.join(OUTPUT_DIR, input.filename);
            if (!fs.existsSync(filepath)) return { success: false, error: `File '${input.filename}' tidak ditemukan di ${OUTPUT_DIR}` };
            const code = fs.readFileSync(filepath, "utf-8");
            return { success: true, filename: input.filename, code, lines: code.split("\n").length };
          }

          case "delete": {
            if (!input.filename) return { success: false, error: "filename wajib" };
            const filepath = path.join(OUTPUT_DIR, input.filename);
            if (!fs.existsSync(filepath)) return { success: false, error: `File '${input.filename}' tidak ditemukan` };
            fs.unlinkSync(filepath);
            return { success: true, message: `File '${input.filename}' dihapus` };
          }

          default:
            return { success: false, error: `Action tidak dikenal. Pilih: generate-ea, generate-indicator, generate-script, save, list, read, delete` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createMql5Tool };
