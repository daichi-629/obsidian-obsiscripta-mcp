export default {
  name: "dataview_example",
  description: "Return a count of pages visible to Dataview.",
  inputSchema: {
    type: "object",
    properties: {}
  },
  handler: async () => {
    if (!dv) {
      return {
        content: [
          {
            type: "text",
            text: "Dataview is not installed, so dv is unavailable."
          }
        ]
      };
    }

    const count = dv.pages().length;
    return {
      content: [
        {
          type: "text",
          text: `Dataview sees ${count} pages.`
        }
      ]
    };
  }
};
