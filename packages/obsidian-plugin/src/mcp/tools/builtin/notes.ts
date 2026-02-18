import { normalizePath, TFile } from "obsidian";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { extractHeadingsWithPositions, HeadingPosition, splitFrontmatter } from "../helpers/markdown-helper";

interface ObsidianLinkParts {
	linkPath: string;
	subpath: string;
	displayText: string;
}

type ReadSectionMode = "header" | "content" | "both";

interface SectionLine {
	lineNumber: number;
	text: string;
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

function extractSectionContent(
	body: string,
	section: string,
	level: number | undefined,
	mode: ReadSectionMode,
	includeSubsections: boolean,
	maxChars: number | undefined,
	withLineNumbers: boolean
): { title: string; level: number; content: string; start_line: number; end_line: number; truncated: boolean } | { error: string } {
	const lines = body.split("\n");
	const headings = extractHeadingsWithPositions(body);

	const matchingHeadings = headings.filter((heading) => heading.text === section && (level === undefined || heading.level === level));
	if (matchingHeadings.length === 0) {
		if (level === undefined) {
			return { error: `Error: Section "${section}" not found.` };
		}
		return { error: `Error: Section "${section}" with level ${level} not found.` };
	}

	const selected = matchingHeadings[0]!;
	const nextSameLevelHeading = headings.find((heading) => heading.lineIndex > selected.lineIndex && heading.level === selected.level);
	const endLineIndex = nextSameLevelHeading ? nextSameLevelHeading.lineIndex - 1 : lines.length - 1;

	const rangeStart = selected.lineIndex;
	const rangeEnd = Math.max(rangeStart, endLineIndex);

	const segmentLines: SectionLine[] = [];
	for (let lineIndex = rangeStart; lineIndex <= rangeEnd; lineIndex += 1) {
		segmentLines.push({
			lineNumber: lineIndex + 1,
			text: lines[lineIndex] ?? ""
		});
	}

	const headerLine = segmentLines[0] ?? { lineNumber: selected.lineNumber, text: "" };
	const contentLines = segmentLines.slice(1);

	const baseContentLines = includeSubsections
		? contentLines
		: (() => {
			const filteredLines: SectionLine[] = [];
			const headingByLine = new Map<number, HeadingPosition>();
			for (const heading of headings) {
				headingByLine.set(heading.lineIndex, heading);
			}

			let skipping = false;
			for (let lineIndex = rangeStart + 1; lineIndex <= rangeEnd; lineIndex += 1) {
				const heading = headingByLine.get(lineIndex);
				if (heading) {
					if (heading.level > selected.level) {
						skipping = true;
						continue;
					}
					skipping = false;
					filteredLines.push({
						lineNumber: lineIndex + 1,
						text: lines[lineIndex] ?? ""
					});
					continue;
				}

				if (!skipping) {
					filteredLines.push({
						lineNumber: lineIndex + 1,
						text: lines[lineIndex] ?? ""
					});
				}
			}

			return filteredLines;
		})();

	const formatLine = (line: SectionLine): string => (withLineNumbers ? `${line.lineNumber}: ${line.text}` : line.text);

	let output = "";
	if (mode === "header") {
		output = formatLine(headerLine);
	} else if (mode === "content") {
		output = baseContentLines.map(formatLine).join("\n");
	} else {
		output = [headerLine, ...baseContentLines].map(formatLine).join("\n");
	}

	let truncated = false;
	if (typeof maxChars === "number" && maxChars >= 0 && output.length > maxChars) {
		output = output.slice(0, maxChars);
		truncated = true;
	}

	return {
		title: selected.text,
		level: selected.level,
		content: output,
		start_line: selected.lineNumber,
		end_line: rangeEnd + 1,
		truncated
	};
}

/**
 * Built-in tool: read_note
 * Reads the content of a note from the vault
 */
export const readNoteTool: MCPToolDefinition = {
	name: "read_note",
	description: "Read a section from a note by heading, excluding frontmatter.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			section: {
				type: "string",
				description: "Heading text to match exactly."
			},
			level: {
				type: "number",
				description: "Heading level (1-6). If omitted, the first matching heading is used."
			},
			mode: {
				type: "string",
				enum: ["header", "content", "both"],
				description: "Which part of the section to return.",
				default: "both"
			},
			include_subsections: {
				type: "boolean",
				description: "When true, include subsection headings/content. When false, subsection headings and their body content are excluded.",
				default: true
			},
			max_chars: {
				type: "number",
				description: "Optional maximum number of characters in the returned content."
			},
			with_line_numbers: {
				type: "boolean",
				description: "When true, prefixes each returned line with its markdown body line number.",
				default: false
			}
		},
		required: ["path", "section"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const section = args.section as string;
		const level = typeof args.level === "number" ? args.level : undefined;
		const mode = (args.mode as ReadSectionMode | undefined) ?? "both";
		const includeSubsections = args.include_subsections !== false;
		const maxChars = typeof args.max_chars === "number" ? args.max_chars : undefined;
		const withLineNumbers = args.with_line_numbers === true;

		if (!section || section.trim().length === 0) {
			return {
				content: [{
					type: "text",
					text: "Error: section is required."
				}],
				isError: true
			};
		}

		if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) {
			return {
				content: [{
					type: "text",
					text: "Error: level must be an integer between 1 and 6."
				}],
				isError: true
			};
		}

		if (!["header", "content", "both"].includes(mode)) {
			return {
				content: [{
					type: "text",
					text: "Error: mode must be one of \"header\", \"content\", or \"both\"."
				}],
				isError: true
			};
		}

		if (maxChars !== undefined && (!Number.isInteger(maxChars) || maxChars < 0)) {
			return {
				content: [{
					type: "text",
					text: "Error: max_chars must be an integer >= 0."
				}],
				isError: true
			};
		}

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
			const { body } = splitFrontmatter(content);
			const resolvedBody = resolveVaultLinks(body, file.path, context);
			const extracted = extractSectionContent(resolvedBody, section.trim(), level, mode, includeSubsections, maxChars, withLineNumbers);

			if ("error" in extracted) {
				return {
					content: [{
						type: "text",
						text: extracted.error
					}],
					isError: true
				};
			}

			return {
				content: [{
					type: "text",
					text: JSON.stringify(extracted, null, 2)
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
