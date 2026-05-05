export default {
  name: "search_web",

  description: "Search the web for current facts.",

  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Clean query"
      }
    },
    required: ["query"]
  },

  execute: async ({ query }) => {
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
      throw new Error("SERPER_API_KEY is not set");
    }

    // 🔥 Clean query (VERY IMPORTANT)
    const cleanQuery = query.replace(/^search\s+/i, "").trim();

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey
      },
      body: JSON.stringify({ q: cleanQuery })
    });

    if (!response.ok) {
      throw new Error(`Serper search failed with status ${response.status}`);
    }

    const data = await response.json();
    const organicResults = Array.isArray(data.organic) ? data.organic : [];

    return {
      results: organicResults.slice(0, 5).map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet
      })),
      query: cleanQuery
    };
  }
};