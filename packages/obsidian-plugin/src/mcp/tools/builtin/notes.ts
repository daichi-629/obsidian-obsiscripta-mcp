import { normalizePath, TFile } from "obsidian";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { getReadSessionKey } from "./note-session";

interface ObsidianLinkParts {
	linkPath: string;
	subpath: string;
	displayText: string;
}

function parseObsidianLink(rawLink: string): ObsidianLinkParts {
	const [targetRaw, displayRaw] = rawLink.split("|");
	const target = targetRaw?.trim() ?? "";
	const displayText = displayRaw?.trim() ?? "";

	const hashIndex = target.indexOf("#");
	if (hashIndex === -1) {
		return {
			linkPath: target,
			subpath: "",
			displayText
		};
	}

	return {
		linkPath: target.slice(0, hashIndex).trim(),
		subpath: target.slice(hashIndex + 1).trim(),
		displayText
	};
}

function resolveVaultLinks(
	markdown: string,
	sourceFilePath: string,
	context: Parameters<MCPToolDefinition["handler"]>[1]
): string {
	return markdown.replace(/(!)?\[\[([^\]\n]+)\]\]/g, (match, embedPrefix, rawLink: string) => {
		const { linkPath, subpath, displayText } = parseObsidianLink(rawLink);
		if (!linkPath) {
			return match;
		}

		const resolvedFile = context.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFilePath);
		if (!resolvedFile) {
			return match;
		}

		const label = displayText || resolvedFile.basename || linkPath;
		const anchorSuffix = subpath ? `#${subpath}` : "";
		const resolvedPath = `${resolvedFile.path}${anchorSuffix}`;

		if (embedPrefix) {
			return `![${label}](${resolvedPath})`;
		}

		return `[${label}](${resolvedPath})`;
	});
}

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
			},
			resolveLinks: {
				type: "boolean",
				description: "If true, converts Obsidian vault links ([[...]] / ![[...]]) in the note body to resolved markdown links using vault-relative paths."
			}
		},
		required: ["path"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const resolveLinks = args.resolveLinks === true;

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
			context.session.set(getReadSessionKey(normalizedPath), true);
			const output = resolveLinks ? resolveVaultLinks(content, file.path, context) : content;
			return {
				content: [{
					type: "text",
					text: output
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
