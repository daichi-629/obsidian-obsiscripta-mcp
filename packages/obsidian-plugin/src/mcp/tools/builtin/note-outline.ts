import { normalizePath, TFile } from "obsidian";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { extractHeadingsFromCodeBlocks, extractHeadingsWithPositions, getFrontmatterLineRange } from "../helpers/markdown-helper";

interface OutlineItem {
	heading: string;
	level: number;
	start_line: number;
	end_line: number;
	id: string;
}

function hashOutlineId(value: string): string {
	let hash = 5381;

	for (let index = 0; index < value.length; index += 1) {
		hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
	}

	return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildOutline(markdown: string, options: {
	maxDepth?: number;
	includeFrontmatter: boolean;
	includeCodeblocks: boolean;
}): OutlineItem[] {
	const normalized = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;
	const lines = normalized.split(/\r?\n/);
	const frontmatterRange = options.includeFrontmatter ? null : getFrontmatterLineRange(normalized);
	const totalLines = lines.length;

	const baseHeadings = extractHeadingsWithPositions(normalized).map((heading) => ({
		heading: heading.text,
		level: heading.level,
		startLine: heading.lineNumber,
		lineIndex: heading.lineIndex
	}));

	const codeHeadings = options.includeCodeblocks
		? extractHeadingsFromCodeBlocks(normalized).map((heading) => ({
			heading: heading.text,
			level: heading.level,
			startLine: heading.lineNumber,
			lineIndex: heading.lineIndex
		}))
		: [];
	const allHeadings = [...baseHeadings, ...codeHeadings]
		.filter((heading) => {
			if (frontmatterRange && heading.startLine >= frontmatterRange.start && heading.startLine <= frontmatterRange.end) {
				return false;
			}
			if (options.maxDepth !== undefined && heading.level > options.maxDepth) {
				return false;
			}
			return true;
		})
		.sort((a, b) => {
			if (a.lineIndex !== b.lineIndex) {
				return a.lineIndex - b.lineIndex;
			}
			return a.level - b.level;
		});

	return allHeadings.map((current, currentIndex) => {
		const nextSameLevel = allHeadings.slice(currentIndex + 1).find((candidate) => candidate.level === current.level);
		const endLine = nextSameLevel ? nextSameLevel.startLine - 1 : totalLines;
		const idSource = `${current.startLine}:${current.heading}`;

		return {
			heading: current.heading,
			level: current.level,
			start_line: current.startLine,
			end_line: endLine,
			id: hashOutlineId(idSource)
		};
	});
}

export const getNoteOutlineTool: MCPToolDefinition = {
	name: "get_note_outline",
	description: "Get the markdown ATX heading outline of a note with line ranges.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			max_depth: {
				type: "number",
				description: "Optional maximum heading depth to include."
			},
			include_frontmatter: {
				type: "boolean",
				description: "If true, includes headings that appear in frontmatter. Default: false."
			},
			include_codeblocks: {
				type: "boolean",
				description: "If true, headings in fenced code blocks are included. Default: true."
			}
		},
		required: ["path"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const maxDepth = typeof args.max_depth === "number" ? args.max_depth : undefined;
		const includeFrontmatter = args.include_frontmatter === true;
		const includeCodeblocks = args.include_codeblocks !== false;

		let normalizedPath = normalizePath(path);
		if (!normalizedPath.toLowerCase().endsWith(".md")) {
			normalizedPath = `${normalizedPath}.md`;
		}

		const file = context.vault.getAbstractFileByPath(normalizedPath);
		if (!file) {
			return {
				content: [{ type: "text", text: `Error: Note not found at path "${normalizedPath}"` }],
				isError: true
			};
		}

		if (!(file instanceof TFile)) {
			return {
				content: [{ type: "text", text: `Error: Path "${normalizedPath}" is a folder, not a note` }],
				isError: true
			};
		}

		try {
			const content = await context.vault.read(file);
			const outline = buildOutline(content, {
				maxDepth,
				includeFrontmatter,
				includeCodeblocks
			});

			return {
				content: [{
					type: "text",
					text: JSON.stringify({ outline }, null, 2)
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

export function getBuiltinNoteOutlineTools(): MCPToolDefinition[] {
	return [getNoteOutlineTool];
}
