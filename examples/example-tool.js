export default {
  name: "example_tool",
  description: "Return the number of markdown files in the vault.",
  inputSchema: {
    type: "object",
    properties: {}
  },
  handler: async (_args, context) => {
    const count = context.vault.getMarkdownFiles().length;
    return {
      content: [
        {
          type: "text",
          text: `Vault has ${count} markdown files.`
        }
      ]
    };
  }
};
