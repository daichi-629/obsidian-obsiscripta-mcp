import { createHash } from "node:crypto";
import { normalizePath, TFile } from "obsidian";
import yaml from "yaml";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { buildFrontmatter, mergeFrontmatter, parseFrontmatterContent, splitFrontmatter } from "./markdown-content";

type FrontmatterObject = Record<string, unknown>;

function normalizeNotePath(path: string): string {
	let normalizedPath = normalizePath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) {
		normalizedPath = `${normalizedPath}.md`;
	}
	return normalizedPath;
}

function isPlainObject(value: unknown): value is FrontmatterObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFrontmatterData(value: unknown): FrontmatterObject {
	if (value == null) {
		return {};
	}
	if (!isPlainObject(value)) {
		throw new Error("frontmatter must be an object.");
	}
	return value;
}

function parseFrontmatterObject(frontmatter: string): FrontmatterObject {
	if (!frontmatter) {
		return {};
	}

	const parsed: unknown = yaml.parse(parseFrontmatterContent(frontmatter));
	return normalizeFrontmatterData(parsed);
}

function stableSerialize(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
	}

	if (isPlainObject(value)) {
		const sortedEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
		return `{${sortedEntries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
	}

	return JSON.stringify(value);
}

function hashFrontmatter(value: FrontmatterObject): string {
	return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function formatFrontmatterOutput(frontmatter: FrontmatterObject, format: "yaml" | "json"): FrontmatterObject | string {
	if (format === "yaml") {
		return yaml.stringify(frontmatter);
	}

	return frontmatter;
}

function jsonResponse(payload: Record<string, unknown>, isError = false): MCPToolResult {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(payload, null, 2)
		}],
		...(isError ? { isError: true } : {})
	};
}

/**
 * Built-in tool: edit_frontmatter
 * Reads and edits YAML frontmatter without modifying markdown body content.
 */
export const editFrontmatterTool: MCPToolDefinition = {
	name: "edit_frontmatter",
	description: "Read/edit note frontmatter only. Supports read/write/merge/delete actions without modifying markdown body content.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			action: {
				type: "string",
				enum: ["read", "write", "merge", "delete"],
				description: "Operation to run against frontmatter."
			},
			data: {
				type: "object",
				description: "Frontmatter object used by write/merge actions."
			},
			keys: {
				type: "array",
				items: { type: "string" },
				description: "Optional keys filter for read, required keys list for delete."
			},
			format: {
				type: "string",
				enum: ["yaml", "json"],
				description: "Output format for frontmatter field.",
				default: "json"
			},
			mergeMode: {
				type: "string",
				enum: ["preserve", "overwrite"],
				description: "merge action mode. preserve keeps existing keys, overwrite replaces existing keys.",
				default: "overwrite"
			}
		},
		required: ["path", "action"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const action = args.action as "read" | "write" | "merge" | "delete";
		const format = (args.format as "yaml" | "json" | undefined) ?? "json";
		const mergeMode = (args.mergeMode as "preserve" | "overwrite" | undefined) ?? "overwrite";
		const keys = args.keys as string[] | undefined;

		if (format !== "yaml" && format !== "json") {
			return jsonResponse({ error: "format must be either 'yaml' or 'json'." }, true);
		}

		if (action !== "read" && action !== "write" && action !== "merge" && action !== "delete") {
			return jsonResponse({ error: "action must be one of read|write|merge|delete." }, true);
		}

		if (keys && (!Array.isArray(keys) || keys.some((key) => typeof key !== "string"))) {
			return jsonResponse({ error: "keys must be an array of strings." }, true);
		}

		const normalizedPath = normalizeNotePath(path);
		const file = context.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return jsonResponse({ error: `Note not found at path "${normalizedPath}"` }, true);
		}

		try {
			const currentContent = await context.vault.read(file);
			const { frontmatter, body } = splitFrontmatter(currentContent);
			const beforeFrontmatter = parseFrontmatterObject(frontmatter);
			const beforeHash = hashFrontmatter(beforeFrontmatter);

			if (action === "read") {
				const filtered = keys?.length
					? Object.fromEntries(keys.filter((key) => key in beforeFrontmatter).map((key) => [key, beforeFrontmatter[key]]))
					: beforeFrontmatter;
				return jsonResponse({
					frontmatter: formatFrontmatterOutput(filtered, format),
					updated: false,
					before_hash: beforeHash,
					after_hash: beforeHash
				});
			}

			let nextFrontmatter = { ...beforeFrontmatter };

			if (action === "write") {
				nextFrontmatter = normalizeFrontmatterData(args.data);
			}

			if (action === "merge") {
				const data = normalizeFrontmatterData(args.data);
				nextFrontmatter = mergeMode === "preserve"
					? { ...data, ...beforeFrontmatter }
					: { ...beforeFrontmatter, ...data };
			}

			if (action === "delete") {
				if (!keys?.length) {
					return jsonResponse({ error: "delete action requires non-empty keys." }, true);
				}
				nextFrontmatter = { ...beforeFrontmatter };
				for (const key of keys) {
					delete nextFrontmatter[key];
				}
			}

			const afterHash = hashFrontmatter(nextFrontmatter);
			const updated = beforeHash !== afterHash;

			if (updated) {
				const nextFrontmatterString = buildFrontmatter(yaml.stringify(nextFrontmatter));
				const nextContent = mergeFrontmatter(nextFrontmatterString, body);
				await context.vault.modify(file, nextContent);
			}

			return jsonResponse({
				frontmatter: formatFrontmatterOutput(nextFrontmatter, format),
				updated,
				before_hash: beforeHash,
				after_hash: afterHash
			});
		} catch (error) {
			return jsonResponse({
				error: `Error while processing frontmatter: ${error instanceof Error ? error.message : String(error)}`
			}, true);
		}
	}
};


/**
 * Get built-in frontmatter tools
 */
export function getBuiltinFrontmatterTools(): MCPToolDefinition[] {
	return [editFrontmatterTool];
}
