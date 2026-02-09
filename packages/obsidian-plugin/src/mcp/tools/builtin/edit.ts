import { TFile } from "obsidian";
import { applyPatch } from "diff";
import { MCPToolDefinition, MCPToolResult } from "../types";

/**
 * Built-in tool: edit_note
 * Applies a unified diff patch to a note in the vault
 */
export const editNoteTool: MCPToolDefinition = {
	name: "edit_note",
	description: "Apply a unified diff patch to edit a note in the vault. The patch must be in unified diff format.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			patch: {
				type: "string",
				description: "Unified diff patch to apply to the note content. Must be in unified diff format."
			}
		},
		required: ["path", "patch"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const patch = args.patch as string;

		// Normalize path: add .md if not present
		let normalizedPath = path;
		if (!normalizedPath.endsWith(".md")) {
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
			// Read the current content
			const currentContent = await context.vault.read(file);

			// Apply the patch
			const patchedContent = applyPatch(currentContent, patch);

			// Check if patch application failed
			if (patchedContent === false) {
				return {
					content: [{
						type: "text",
						text: "Error: Failed to apply patch. The patch may be malformed or not compatible with the current file content."
					}],
					isError: true
				};
			}

			// Write the patched content back to the file
			await context.vault.modify(file, patchedContent);

			return {
				content: [{
					type: "text",
					text: `Successfully applied patch to "${normalizedPath}"`
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: "text",
					text: `Error applying patch: ${error instanceof Error ? error.message : String(error)}`
				}],
				isError: true
			};
		}
	}
};

/**
 * Get all built-in edit tools
 */
export function getBuiltinEditTools(): MCPToolDefinition[] {
	return [editNoteTool];
}
