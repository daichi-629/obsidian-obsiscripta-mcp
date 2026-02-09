import { normalizePath, TFile } from "obsidian";
import { MCPToolDefinition, MCPToolResult } from "../types";

/**
 * Built-in tool: read_note
 * Reads the content of a note from the vault
 */
export const readNoteTool: MCPToolDefinition = {
	name: "read_note",
	description: "Read the content of a note from the vault. Returns the full markdown content of the specified note.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			}
		},
		required: ["path"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;

		// Normalize path using Obsidian's helper (handles path separators)
		let normalizedPath = normalizePath(path);

		// Add .md extension if not present (case-insensitive check)
		if (!normalizedPath.toLowerCase().endsWith(".md")) {
			normalizedPath = `${normalizedPath}.md`;
		}

		// Get the file
		const file = context.vault.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return {
				content: [{
					type: "text",
					text: `Error: Note not found at path "${normalizedPath}"`
				}],
				isError: true
			};
		}

		if (!(file instanceof TFile)) {
			return {
				content: [{
					type: "text",
					text: `Error: Path "${normalizedPath}" is a folder, not a note`
				}],
				isError: true
			};
		}

		try {
			const content = await context.vault.read(file);
			return {
				content: [{
					type: "text",
					text: content
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: "text",
					text: `Error reading note: ${error instanceof Error ? error.message : String(error)}`
				}],
				isError: true
			};
		}
	}
};

/**
 * Get all built-in note tools
 */
export function getBuiltinNoteTools(): MCPToolDefinition[] {
	return [readNoteTool];
}
