import { normalizePath, TFile } from "obsidian";
import diff_match_patch from "diff-match-patch";
import { MCPToolDefinition, MCPToolResult } from "../types";

function normalizeNotePath(path: string): string {
	let normalizedPath = normalizePath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) {
		normalizedPath = `${normalizedPath}.md`;
	}
	return normalizedPath;
}

function applyFuzzyPatch(currentContent: string, patchText: string): { ok: true; content: string } | { ok: false; error: string } {
	const dmp = new diff_match_patch();
	let patches: unknown[];
	try {
		patches = dmp.patch_fromText(patchText);
	} catch (error) {
		return {
			ok: false,
			error: `Error: Failed to parse patch text. ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const [patchedContent, results] = dmp.patch_apply(patches, currentContent);
	if (!results.every(Boolean)) {
		return { ok: false, error: "Error: Failed to apply fuzzy patch. The target text was not found." };
	}
	return { ok: true, content: patchedContent };
}


/**
 * Built-in tool: edit_note
 * Applies a diff-match-patch format patch to a note in the vault
 */
export const editNoteTool: MCPToolDefinition = {
	name: "edit_note",
	description: "Apply a diff-match-patch format patch to edit a note in the vault.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			patch: {
				type: "string",
				description: "Patch to apply in diff-match-patch text format."
			},
			create: {
				type: "boolean",
				description: "Allow creating a note if it does not exist.",
				default: false
			},
			delete: {
				type: "boolean",
				description: "Allow deleting a note. When true, patch can be omitted.",
				default: false
			}
		},
		required: ["path"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const patch = (args.patch as string | undefined) ?? "";
		const allowCreate = Boolean(args.create);
		const allowDelete = Boolean(args.delete);

		if (allowCreate && allowDelete) {
			return {
				content: [{
					type: "text",
					text: "Error: create and delete cannot both be true."
				}],
				isError: true
			};
		}

		const normalizedPath = normalizeNotePath(path);
		const trimmedPatch = patch.trim();

		if (trimmedPatch.length === 0) {
			if (allowDelete) {
				const file = context.vault.getAbstractFileByPath(normalizedPath);
				if (!file || !(file instanceof TFile)) {
					return {
						content: [{
							type: "text",
							text: `Error: Note not found at path "${normalizedPath}"`
						}],
						isError: true
					};
				}
				await context.app.fileManager.trashFile(file);
				return {
					content: [{
						type: "text",
						text: `Successfully deleted "${normalizedPath}"`
					}]
				};
			}
			return {
				content: [{
					type: "text",
					text: "Error: patch is required unless delete=true."
				}],
				isError: true
			};
		}

		// Get the file
		const file = context.vault.getAbstractFileByPath(normalizedPath);

		if (!file && !allowCreate) {
			return {
				content: [{
					type: "text",
					text: `Error: Note not found at path "${normalizedPath}"`
				}],
				isError: true
			};
		}

		if (file && !(file instanceof TFile)) {
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
			const currentContent = file ? await context.vault.read(file) : "";
			const fuzzyResult = applyFuzzyPatch(currentContent, patch);
			if (!fuzzyResult.ok) {
				return {
					content: [{
						type: "text",
						text: fuzzyResult.error
					}],
					isError: true
				};
			}
			const nextContent = fuzzyResult.content;

			if (nextContent === currentContent) {
				return {
					content: [{
						type: "text",
						text: "Error: Patch applied but produced no changes. Check that the patch matches the current file content."
					}],
					isError: true
				};
			}

			if (!file) {
				if (!allowCreate) {
					return {
						content: [{
							type: "text",
							text: "Error: create is not allowed. Set create=true to enable note creation."
						}],
						isError: true
					};
				}
				await context.vault.create(normalizedPath, nextContent);
				return {
					content: [{
						type: "text",
						text: `Successfully created "${normalizedPath}"`
					}]
				};
			}

			// Write the patched content back to the file
			await context.vault.modify(file, nextContent);

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
