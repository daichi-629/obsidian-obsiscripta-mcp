import { normalizePath, TFile } from "obsidian";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { splitFrontmatter, mergeFrontmatter } from "../helpers/markdown-helper";
import {
	buildFrontmatterBlock,
	deepEqual,
	deepMergeObjects,
	parseFrontmatterBlock,
} from "../helpers/yaml-helper";

function normalizeNotePath(path: string): string {
	let normalizedPath = normalizePath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) {
		normalizedPath = `${normalizedPath}.md`;
	}
	return normalizedPath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export const readFrontmatterTool: MCPToolDefinition = {
	name: "read_frontmatter",
	description: "Read YAML frontmatter from a note without reading body content.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description:
					"Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional.",
			},
			keys: {
				type: "array",
				items: { type: "string" },
				description:
					"Optional list of keys to return. When omitted, returns the entire frontmatter object.",
			},
			include_missing: {
				type: "boolean",
				description:
					"When true and keys are specified, include keys with null for missing entries. Default: false.",
				default: false,
			},
		},
		required: ["path"],
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = typeof args.path === "string" ? args.path : "";
		const keys = args.keys;
		const includeMissing = args.include_missing === true;

		if (!path || path.trim().length === 0) {
			return {
				content: [{ type: "text", text: "Error: path is required." }],
				isError: true,
			};
		}

		if (keys !== undefined && !isStringArray(keys)) {
			return {
				content: [{ type: "text", text: "Error: keys must be an array of strings." }],
				isError: true,
			};
		}

		const normalizedPath = normalizeNotePath(path);
		const file = context.vault.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return {
				content: [{ type: "text", text: `Error: Note not found at path "${normalizedPath}"` }],
				isError: true,
			};
		}

		if (!(file instanceof TFile)) {
			return {
				content: [{ type: "text", text: `Error: Path "${normalizedPath}" is a folder, not a note` }],
				isError: true,
			};
		}

		try {
			const content = await context.vault.read(file);
			const { frontmatter } = splitFrontmatter(content);
			const parsed = parseFrontmatterBlock(frontmatter);

			if ("error" in parsed) {
				return {
					content: [{ type: "text", text: parsed.error }],
					isError: true,
				};
			}

			let result: Record<string, unknown> = parsed.data;
			if (Array.isArray(keys)) {
				const filtered: Record<string, unknown> = {};
				for (const key of keys) {
					if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
						filtered[key] = parsed.data[key];
					} else if (includeMissing) {
						filtered[key] = null;
					}
				}
				result = filtered;
			}

			return {
				content: [{ type: "text", text: JSON.stringify({ path: normalizedPath, frontmatter: result }, null, 2) }],
			};
		} catch (error) {
			return {
				content: [
					{ type: "text", text: `Error reading note: ${error instanceof Error ? error.message : String(error)}` },
				],
				isError: true,
			};
		}
	},
};

export const editFrontmatterTool: MCPToolDefinition = {
	name: "edit_frontmatter",
	description: "Edit YAML frontmatter in a note. Does not modify the markdown body.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description:
					"Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional.",
			},
			mode: {
				type: "string",
				enum: ["set", "merge", "delete"],
				description:
					"Operation to perform on frontmatter. Default: set.",
				default: "set",
			},
			data: {
				type: "object",
				description: "Key/value pairs used by set/merge modes.",
			},
			keys: {
				type: "array",
				items: { type: "string" },
				description: "Keys to delete when mode=delete.",
			},
			allow_create: {
				type: "boolean",
				description: "Allow creating a note if it does not exist. Default: false.",
				default: false,
			},
		},
		required: ["path"],
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = typeof args.path === "string" ? args.path : "";
		const mode = typeof args.mode === "string" ? args.mode : "set";
		const data = args.data;
		const keys = args.keys;
		const allowCreate = args.allow_create === true;

		if (!path || path.trim().length === 0) {
			return {
				content: [{ type: "text", text: "Error: path is required." }],
				isError: true,
			};
		}

		if (!["set", "merge", "delete"].includes(mode)) {
			return {
				content: [{ type: "text", text: "Error: mode must be one of \"set\", \"merge\", or \"delete\"." }],
				isError: true,
			};
		}

		if ((mode === "set" || mode === "merge") && (data === undefined || !isPlainObject(data))) {
			return {
				content: [{ type: "text", text: "Error: data is required and must be an object for set/merge." }],
				isError: true,
			};
		}

		if (mode === "delete" && (keys === undefined || !isStringArray(keys) || keys.length === 0)) {
			return {
				content: [{ type: "text", text: "Error: keys is required and must be a non-empty array of strings for delete." }],
				isError: true,
			};
		}

		const normalizedPath = normalizeNotePath(path);
		const abstractFile = context.vault.getAbstractFileByPath(normalizedPath);
		let file: TFile | null = abstractFile instanceof TFile ? abstractFile : null;

		if (!file && !allowCreate) {
			return {
				content: [{ type: "text", text: `Error: Note not found at path "${normalizedPath}"` }],
				isError: true,
			};
		}

		if (abstractFile && !file) {
			return {
				content: [{ type: "text", text: `Error: Path "${normalizedPath}" is a folder, not a note` }],
				isError: true,
			};
		}

		try {
			const currentContent = file ? await context.vault.read(file) : "";
			const { frontmatter, body } = splitFrontmatter(currentContent);
			const parsed = parseFrontmatterBlock(frontmatter);

			if ("error" in parsed) {
				return {
					content: [{ type: "text", text: parsed.error }],
					isError: true,
				};
			}

			let nextFrontmatter: Record<string, unknown> = { ...parsed.data };
			let changed = false;

			if (mode === "set") {
				const incoming = data as Record<string, unknown>;
				nextFrontmatter = { ...nextFrontmatter };
				for (const [key, value] of Object.entries(incoming)) {
					if (!Object.prototype.hasOwnProperty.call(nextFrontmatter, key) || !deepEqual(nextFrontmatter[key], value)) {
						nextFrontmatter[key] = value;
						changed = true;
					}
				}
			}

			if (mode === "merge") {
				const incoming = data as Record<string, unknown>;
				const merged = deepMergeObjects(nextFrontmatter, incoming);
				changed = !deepEqual(nextFrontmatter, merged);
				nextFrontmatter = merged;
			}

			if (mode === "delete") {
				const deleteKeys = keys as string[];
				for (const key of deleteKeys) {
					if (Object.prototype.hasOwnProperty.call(nextFrontmatter, key)) {
						delete nextFrontmatter[key];
						changed = true;
					}
				}
			}

			if (!file && allowCreate) {
				const content = mergeFrontmatter(buildFrontmatterBlock(nextFrontmatter), "");
				file = await context.vault.create(normalizedPath, content);
			} else {
				if (!changed) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ ok: true, path: normalizedPath, mode, changed: false, frontmatter: nextFrontmatter }, null, 2),
							},
						],
						isError: false,
					};
				}
				const nextContent = mergeFrontmatter(buildFrontmatterBlock(nextFrontmatter), body);
				if (!file) {
					return {
						content: [{ type: "text", text: `Error: Note not found at path "${normalizedPath}"` }],
						isError: true,
					};
				}
				await context.vault.modify(file, nextContent);
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ok: true, path: normalizedPath, mode, changed: true, frontmatter: nextFrontmatter }, null, 2),
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{ type: "text", text: `Error editing frontmatter: ${error instanceof Error ? error.message : String(error)}` },
				],
				isError: true,
			};
		}
	},
};

export function getBuiltinFrontmatterTools(): MCPToolDefinition[] {
	return [readFrontmatterTool, editFrontmatterTool];
}
