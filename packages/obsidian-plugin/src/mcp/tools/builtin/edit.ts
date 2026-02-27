import { normalizePath, TFile } from "obsidian";
import { applyPatch, parsePatch } from "diff";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { mergeFrontmatter, splitFrontmatter } from "../helpers/markdown-helper";

function normalizeNotePath(path: string): string {
	let normalizedPath = normalizePath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) {
		normalizedPath = `${normalizedPath}.md`;
	}
	return normalizedPath;
}

function normalizeLineEndings(value: string): string {
	return value.replace(/\r\n/g, "\n");
}

function stripGitDiffMetadata(patchText: string): string {
	return patchText
		.replace(/^diff --git .*(\n|$)/gm, "")
		.replace(/^index .*(\n|$)/gm, "")
		.replace(/^new file mode .*(\n|$)/gm, "")
		.replace(/^deleted file mode .*(\n|$)/gm, "")
		.replace(/^similarity index .*(\n|$)/gm, "")
		.replace(/^rename from .*(\n|$)/gm, "")
		.replace(/^rename to .*(\n|$)/gm, "");
}

function ensureUnifiedHeaders(patchText: string): string {
	if (/^--- /m.test(patchText) && /^\+\+\+ /m.test(patchText)) {
		return patchText;
	}
	return `--- a/body.md\n+++ b/body.md\n${patchText}`;
}

function collectPatchCandidates(patchText: string): string[] {
	const normalized = normalizeLineEndings(patchText).replace(/^\uFEFF/, "");
	const withTrailingNewline = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
	const stripped = stripGitDiffMetadata(withTrailingNewline);
	const candidates = new Set<string>([
		withTrailingNewline,
		stripped,
		ensureUnifiedHeaders(stripped)
	]);

	return Array.from(candidates).filter((candidate) => candidate.trim().length > 0);
}

function buildContentFromEmptyPatch(patchText: string): string | null {
	try {
		const patches = parsePatch(patchText);
		if (patches.length !== 1) {
			return null;
		}
		const patch = patches[0]!;
		const lines: string[] = [];

		for (const hunk of patch.hunks ?? []) {
			for (const line of hunk.lines ?? []) {
				if (line.startsWith("+")) {
					lines.push(line.slice(1));
					continue;
				}
				if (line.startsWith("\\") || line.startsWith("@")) {
					continue;
				}
				if (line.startsWith(" ") || line.startsWith("-")) {
					return null;
				}
			}
		}

		return lines.join("\n");
	} catch {
		return null;
	}
}

function applyUnifiedPatch(currentContent: string, patchText: string): { ok: true; content: string } | { ok: false; error: string } {
	const normalizedContent = normalizeLineEndings(currentContent);
	const candidates = collectPatchCandidates(patchText);

	if (normalizedContent.length === 0) {
		for (const candidate of candidates) {
			const built = buildContentFromEmptyPatch(candidate);
			if (built !== null) {
				return { ok: true, content: built };
			}
		}
	}

	let lastError: string | null = null;

	for (const candidate of candidates) {
		try {
			const patched = applyPatch(normalizedContent, candidate, {
				fuzzFactor: 10
			});
			if (patched === false) {
				lastError = "Error: Failed to apply unified patch to markdown content.";
				continue;
			}
			return { ok: true, content: patched };
		} catch (error) {
			lastError = `Error: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	return { ok: false, error: lastError ?? "Error: Failed to apply unified patch to markdown content." };
}


/**
 * Built-in tool: edit_note
 * Applies a unified diff patch to a note in the vault
 */
export const editNoteTool: MCPToolDefinition = {
	name: "edit_note",
	description: "Apply a unified diff patch to markdown content in a note, excluding frontmatter.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			patch: {
				type: "string",
				description: "Unified diff patch to apply against markdown body content (frontmatter excluded)."
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
			const { frontmatter, body } = splitFrontmatter(currentContent);
			const patchResult = applyUnifiedPatch(body, patch);
			if (!patchResult.ok) {
				return {
					content: [{
						type: "text",
						text: patchResult.error
					}],
					isError: true
				};
			}
			const nextBodyContent = patchResult.content;
			const nextContent = mergeFrontmatter(frontmatter, nextBodyContent);

			if (nextBodyContent === body) {
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
