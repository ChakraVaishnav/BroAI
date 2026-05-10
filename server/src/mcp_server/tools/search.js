import { tavily } from '@tavily/core';

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

async function serperSearch(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY is not set for fallback");
  }

  const cleanQuery = String(query || "").trim();
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
}

export const searchTools = [
  {
    name: "web_search",
    description: "ALWAYS use this tool for any question about current events, recent news, latest updates, sports results, scores, today's information, or anything that requires up-to-date data. Your training data is outdated. Never answer news, sports, or current events questions from memory. Always call this tool first before answering.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific — include team names, dates, and context for sports/news queries. Example: 'CSK vs LSG IPL 2026 May 10 match result'"
        }
      },
      required: ["query"]
    },
    execute: async ({ query }) => {
      try {
        console.log('[SEARCH] Attempting Tavily search...');
        const response = await tavilyClient.search(query, {
          searchDepth: "advanced",
          maxResults: 5,
          includeAnswer: true,
        });

        // PROBLEM FIX: Return as a structured object, not a plain string.
        // The MCP SDK requires structuredContent to be a record/object.
        return {
          source: "tavily",
          answer: response.answer || null,
          results: response.results.map(r => ({
            title: r.title,
            content: r.content,
            url: r.url
          }))
        };
      } catch (error) {
        console.warn('[SEARCH] Tavily failed, falling back to Serper. Error:', error.message);
        
        try {
          const serperResults = await serperSearch(query);
          return {
            source: "serper_fallback",
            query: serperResults.query,
            results: serperResults.results
          };
        } catch (serperError) {
          console.error('[SEARCH ERROR] Both Tavily and Serper failed:', serperError.message);
          throw new Error(`Search failed: Tavily (${error.message}) and Serper (${serperError.message})`);
        }
      }
    }
  }
];
