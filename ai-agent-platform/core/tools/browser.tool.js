"use strict";

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

/**
 * Factory Browser Tool — Fix BUG-02: tidak lagi pakai global singleton.
 * Setiap createBrowserTool() menghasilkan instance terpisah dengan state sendiri.
 * Ini menghilangkan race condition jika 2 agent berjalan paralel.
 */
function createBrowserTool() {
  // State browser terisolasi per-instance (bukan global)
  let browser = null;
  let page = null;
  let context = null;

  /**
   * Inisialisasi browser jika belum ada.
   * Dipanggil lazy (hanya saat pertama kali dibutuhkan).
   */
  async function initBrowser() {
    if (browser) return; // sudah diinisialisasi

    console.log(`[BrowserTool] Memulai peluncuran Chromium Headless...`);
    browser = await chromium.launch({ headless: true });
    console.log(`[BrowserTool] Chromium berhasil diluncurkan. Membuka konteks stealth...`);

    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
    });

    page = await context.newPage();

    // === ANTI-DETECTION STEALTH SCRIPTS ===
    await page.addInitScript(() => {
      // 1. Hapus webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. Mock chrome runtime (headless tidak punya ini)
      if (!window.chrome) {
        window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
      }

      // 3. Mock navigator properties agar mirip browser asli
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'id'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

      // 4. Permissions API mock (headless sering tidak punya)
      if (navigator.permissions) {
        const origQuery = navigator.permissions.query;
        navigator.permissions.query = (params) =>
          params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : origQuery.call(navigator.permissions, params);
      }

      // 5. Canvas fingerprint noise — tambahkan noise kecil ke canvas
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] ^= 1; // Noise 1-bit di red channel
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.call(this, type);
      };

      // 6. WebGL vendor & renderer mock
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return origGetParam.call(this, param);
      };
    });

    console.log(`[BrowserTool] Halaman baru siap (stealth mode aktif).`);
  }

  return {
    name: "browser-tool",
    description: "Alat navigasi web Playwright. SANGAT PENTING: Panggil tool ini bertahap! Mulai dengan 'search' atau 'goto', baru bisa 'screenshot'.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'search' (pencarian DuckDuckGo), 'goto' (buka URL), 'click', 'type', 'getText', 'screenshot', 'waitForText' (tunggu teks muncul), 'evaluate' (jalankan JS), atau 'close'." },
        url: { type: "string", description: "(Khusus 'goto') URL lengkap yang ingin dibuka." },
        selector: { type: "string", description: "(Khusus click, type, getText). Opsional pada getText, biarkan kosong untuk membaca seluruh teks halaman." },
        text: { type: "string", description: "(Khusus 'type' atau 'search') Kata kunci untuk dicari atau diketik." },
        pressEnter: { type: "boolean", description: "(Khusus action 'type') Set true jika ingin otomatis menekan tombol Enter setelah mengetik." }
      },
      required: ["action"]
    },
    async run(input) {
      try {
        // Inisialisasi lazy — jangan buat browser jika hanya action 'close'
        if (input.action !== "close") {
          await initBrowser();
        }

        switch (input.action) {
          case "search": {
            if (!input.text) return { error: "Kata kunci pencarian 'text' wajib!" };
            console.log(`[BrowserTool] Pencarian via DuckDuckGo: ${input.text}`);
            const query = encodeURIComponent(input.text);
            await page.goto(`https://duckduckgo.com/?q=${query}`, { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForTimeout(2000);
            return {
              success: true,
              message: `Pencarian untuk '${input.text}' berhasil. Gunakan 'getText' atau 'screenshot' untuk membaca hasil.`,
              title: await page.title(),
            };
          }

          case "goto": {
            if (!input.url) return { error: "Url tidak disertakan!" };

            // Fix BUG-07: TIDAK lagi redirect diam-diam. Beri tahu LLM dengan jujur.
            if (input.url.includes("google.com")) {
              return {
                success: false,
                warning: "Google.com diblokir oleh CAPTCHA. Gunakan action 'search' sebagai gantinya untuk pencarian web yang aman.",
              };
            }

            console.log(`[BrowserTool] Menavigasi ke: ${input.url} ...`);
            await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 15000 });
            console.log(`[BrowserTool] Selesai load: ${input.url}`);
            return { success: true, message: `Berhasil membuka ${input.url}`, title: await page.title() };
          }

          case "click": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL. Gunakan 'goto' atau 'search' terlebih dahulu." };
            if (!input.selector) return { error: "Selector elemen kosong!" };
            console.log(`[BrowserTool] Klik elemen: ${input.selector}`);
            await page.waitForSelector(input.selector, { timeout: 3000 });
            await page.click(input.selector);
            return { success: true, message: `Elemen ${input.selector} diklik.` };
          }

          case "type": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL. Gunakan 'goto' atau 'search' terlebih dahulu." };
            if (!input.selector || !input.text) return { error: "Butuh selector dan text input." };
            console.log(`[BrowserTool] Mengetik "${input.text}" ke ${input.selector}`);
            await page.waitForSelector(input.selector, { timeout: 3000 });
            await page.fill(input.selector, input.text);
            if (input.pressEnter === true || input.pressEnter === "true") {
              await page.press(input.selector, "Enter");
              await page.waitForTimeout(1500);
            }
            return { success: true, message: `Berhasil mengetik ke ${input.selector}${input.pressEnter ? " dan menekan Enter" : ""}` };
          }

          case "getText": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL." };
            const sel = input.selector || "body";
            console.log(`[BrowserTool] Membaca teks dari: ${sel}`);
            const textNodes = await page.locator(sel).allInnerTexts();
            return { success: true, content: textNodes.join("\n").replace(/\s+/g, " ").substring(0, 3000) };
          }

          case "screenshot": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL. Gunakan 'goto' atau 'search' terlebih dahulu." };
            console.log(`[BrowserTool] Mengambil screenshot...`);
            const screensDir = path.resolve(process.cwd(), "data/screenshots");
            if (!fs.existsSync(screensDir)) fs.mkdirSync(screensDir, { recursive: true });
            const fileName = `mata_agen_${Date.now()}.png`;
            const filePath = path.join(screensDir, fileName);
            await page.screenshot({ path: filePath, fullPage: true });
            console.log(`[BrowserTool] Screenshot disimpan di: ${filePath}`);
            return { success: true, path: filePath, message: "Screenshot berhasil diambil." };
          }

          case "close": {
            if (browser) {
              await browser.close();
              browser = null;
              context = null;
              page = null;
            }
            return { success: true, message: "Browser ditutup dan memory dibersihkan." };
          }

          case "waitForText": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL." };
            if (!input.text) return { error: "Parameter 'text' wajib untuk waitForText." };
            const waitTimeout = input.timeoutMs || 10000;
            console.log(`[BrowserTool] Menunggu teks "${input.text}" muncul (timeout: ${waitTimeout}ms)...`);
            try {
              await page.waitForFunction(
                (t) => document.body.innerText.includes(t),
                input.text,
                { timeout: waitTimeout }
              );
              return { success: true, message: `Teks "${input.text}" ditemukan di halaman.` };
            } catch (_timeoutErr) {
              return { success: false, message: `Teks "${input.text}" TIDAK muncul setelah ${waitTimeout}ms.` };
            }
          }

          case "evaluate": {
            if (!page || page.url() === "about:blank") return { error: "Browser belum membuka URL." };
            if (!input.expression) return { error: "Parameter 'expression' (kode JS) wajib untuk evaluate." };
            console.log(`[BrowserTool] Menjalankan JavaScript di halaman...`);
            try {
              const evalResult = await page.evaluate(input.expression);
              const serialized = JSON.stringify(evalResult);
              return { success: true, result: serialized ? serialized.slice(0, 3000) : "(undefined)" };
            } catch (evalErr) {
              return { success: false, error: `Evaluate error: ${evalErr.message}` };
            }
          }

          default:
            return { error: `Perintah '${input.action}' tidak dikenal. Pilihan valid: search, goto, click, type, getText, screenshot, close.` };
        }
      } catch (err) {
        return { success: false, error: "Kesalahan Fatal Playwright: " + err.message };
      }
    }
  };
}

module.exports = { createBrowserTool };

