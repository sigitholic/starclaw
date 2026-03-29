"use strict";

/**
 * GitHub Skill Tool
 * Memungkinkan Agent untuk berinteraksi dengan repository (read/issues).
 * Dibutuhkan token GitHub_PAT (Personal Access Token) di env jika private.
 */
function createGithubTool() {
  return {
    name: "github-tool",
    description: "Membaca repository atau melihat daftar issues di GitHub.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "'list_issues' untuk melihat issue, 'get_repo' untuk mengambil info repo." },
        repo: { type: "string", description: "Format <owner>/<repository> (contoh: facebook/react)." }
      },
      required: ["action", "repo"]
    },
    async run(input) {
      const action = input.action; // 'list_issues', 'get_repo'
      const repo = input.repo; // format 'owner/repo'
      
      if (!repo || !action) {
        return { error: "Membutuhkan 'action' dan 'repo' (owner/repo)" };
      }

      const headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Starclaw-Agent"
      };

      if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
      }

      try {
        let url = "";
        if (action === "list_issues") {
          url = `https://api.github.com/repos/${repo}/issues?state=open`;
        } else if (action === "get_repo") {
          url = `https://api.github.com/repos/${repo}`;
        } else {
          return { error: "Unknown action. Supported: list_issues, get_repo" };
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Return simplified response untuk menghemat token
        if (action === "list_issues") {
          return {
            issues: data.map(issue => ({
              number: issue.number,
              title: issue.title,
              state: issue.state,
              url: issue.html_url
            }))
          };
        }

        return {
          repo: {
            name: data.full_name,
            description: data.description,
            stars: data.stargazers_count,
            forks: data.forks_count,
            clone_url: data.clone_url
          }
        };

      } catch (error) {
        return { error: error.message };
      }
    }
  };
}

module.exports = { createGithubTool };
