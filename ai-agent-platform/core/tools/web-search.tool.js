"use strict";

function createWebSearchTool() {
  return {
    name: "web-search-tool",
    description: "Melakukan pencarian di internet/web untuk mencari data aktual terkini.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci pencarian yang spesifik." }
      },
      required: ["query"]
    },
    async run(input) {
      const query = input.query;
      if (!query) return { error: "No query provided. Use 'query' field." };
      
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });
        const text = await response.text();
        
        // Simple extraction logic for duckduckgo html results
        const snippets = text.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi);
        
        if (snippets && snippets.length > 0) {
          const results = snippets.slice(0, 3).map(s => {
            // Remove html tags and decode entities loosely
            return s.replace(/<[^>]*>/g, '').trim();
          });
          return { results };
        }
        
        return { results: ["No results found or search blocked."] };
      } catch (error) {
        return { error: error.message };
      }
    },
  };
}

module.exports = { createWebSearchTool };
