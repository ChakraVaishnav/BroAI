export const searchTools = [
  {
    name: "web_search",
    description: "Searches the web for live information and news.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query to look up on the web" },
      },
      required: ["query"],
    },
    execute: async ({ query }) => {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error("SERPER_API_KEY is not set");
      }

      const cleanQuery = String(query || "").replace(/^search\s+/i, "").trim();

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ q: cleanQuery }),
      });

      if (!response.ok) {
        throw new Error(`Serper search failed with status ${response.status}`);
      }

      const data = await response.json();
      const organicResults = Array.isArray(data.organic) ? data.organic : [];

      return {
        query: cleanQuery,
        results: organicResults.slice(0, 5).map((item) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        })),
      };
    },
  },
];
