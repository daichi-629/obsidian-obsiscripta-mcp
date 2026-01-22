export default {
  name: "templater_example",
  description: "Render a Templater template file and return the output.",
  inputSchema: {
    type: "object",
    properties: {
      templatePath: {
        type: "string",
        description: "Path to the template file."
      },
      runMode: {
        type: "string",
        description: "Templater run mode (optional)."
      }
    },
    required: ["templatePath"]
  },
  handler: async (args) => {
    if (
      !tp ||
      typeof tp.create_running_config !== "function" ||
      typeof tp.read_and_parse_template !== "function"
    ) {
      return {
        content: [
          {
            type: "text",
            text: "Templater is not installed or required tp APIs are unavailable."
          }
        ]
      };
    }

    const templatePath = args.templatePath;
    const runMode = args.runMode ?? "CreateNewFromTemplate";
    const getFileByPath = (path) => {
      const getter = app.vault.getFileByPath;
      if (typeof getter === "function") {
        return getter.call(app.vault, path);
      }
      const file = app.vault.getAbstractFileByPath(path);
      return file && file.extension === "md" ? file : null;
    };
    const templateFile = getFileByPath(templatePath);
    if (!templateFile) {
      return {
        content: [
          {
            type: "text",
            text: `Template note not found: ${templatePath}`
          }
        ],
        isError: true
      };
    }

    try {
      const config = tp.create_running_config(templateFile, templateFile, runMode);
      const rendered = await tp.read_and_parse_template(config);
      return {
        content: [
          {
            type: "text",
            text: rendered
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Templater error: ${message}`
          }
        ],
        isError: true
      };
    }
  }
};
