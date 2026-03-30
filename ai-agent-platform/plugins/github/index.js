"use strict";

const { createGithubTool } = require("./github.tool");

/**
 * Plugin: GitHub
 *
 * Integrasi GitHub — baca repository dan lihat issues.
 *
 * Konfigurasi (set di .env atau via plugin-config-tool):
 *   GITHUB_TOKEN — Personal Access Token (opsional, untuk private repo)
 *
 * Cara konfigurasi via agent:
 *   "set GitHub token ke ghp_xxxx"
 */
module.exports = {
  name: "github",
  version: "1.0.0",
  description: "Integrasi GitHub — baca repository dan lihat issues. Set GITHUB_TOKEN untuk private repo.",

  tools: [createGithubTool()],

  workflows: [],

  activate(context) {
    const hasToken = !!process.env.GITHUB_TOKEN;
    console.log(`[Plugin:github] Aktif${hasToken ? " (dengan token)" : " (tanpa token — hanya public repo)"}`);
  },

  deactivate() {
    console.log("[Plugin:github] Dinonaktifkan.");
  },
};
