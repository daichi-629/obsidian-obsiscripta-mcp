export default {
  name: "omnisearch_search",
  description: "Search the vault using the Omnisearch plugin",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" }
    },
    required: ["query"]
  },
  handler: async (args) => {
    if (typeof omnisearch === "undefined") {
      return {
        content: [
          {
            type: "text",
            text: "Omnisearch is not available. Install and enable the Omnisearch plugin."
          }
        ]
      };
    }

    const results = await omnisearch.search(args.query);
    const top = results
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((result) => `- ${result.path} (score: ${Math.round(result.score)})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: top.length > 0 ? top : "No results."
        }
      ]
    };
  }
};
