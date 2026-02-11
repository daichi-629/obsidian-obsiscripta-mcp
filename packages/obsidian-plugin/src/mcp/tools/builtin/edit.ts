import { normalizePath, TFile } from "obsidian";
import diff_match_patch from "diff-match-patch";
import { MCPToolDefinition, MCPToolResult } from "../types";
import { mergeFrontmatter, splitFrontmatter } from "./markdown-content";

interface HeadingMatch {
	level: number;
	text: string;
	start: number;
	lineEnd: number;
}

type EditMode = "replace" | "append" | "prepend" | "patch";

function normalizeNotePath(path: string): string {
	let normalizedPath = normalizePath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) {
		normalizedPath = `${normalizedPath}.md`;
	}
	return normalizedPath;
}

function normalizeHeadingText(text: string): string {
	return text.trim().replace(/[ \t]+#+\s*$/, "").trim();
}

function findHeadings(markdownBody: string): HeadingMatch[] {
	const headingRegex = /^(#{1,6})[ \t]+(.+)$/gm;
	const headings: HeadingMatch[] = [];
	for (const match of markdownBody.matchAll(headingRegex)) {
		const fullMatch = match[0];
		const hashes = match[1];
		const headingText = match[2];
		if (!fullMatch || !hashes || !headingText) {
			continue;
		}
		const index = match.index ?? 0;
		const lineEnd = index + fullMatch.length;
		headings.push({
			level: hashes.length,
			text: normalizeHeadingText(headingText),
			start: index,
			lineEnd
		});
	}
	return headings;
}

function lineNumberAt(content: string, index: number): number {
	if (index <= 0) {
		return 1;
	}
	let line = 1;
	for (let i = 0; i < Math.min(index, content.length); i += 1) {
		if (content[i] === "\n") {
			line += 1;
		}
	}
	return line;
}

function stableHash(text: string): string {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function applyFuzzyPatch(sectionBody: string, patchText: string): { ok: true; content: string } | { ok: false; error: string } {
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
	const [patchedContent, results] = dmp.patch_apply(patches, sectionBody);
	if (!results.every(Boolean)) {
		return { ok: false, error: "Error: Failed to apply section patch. The target text was not found in the section body." };
	}
	return { ok: true, content: patchedContent };
}

/**
 * Built-in tool: edit_note
 * Updates only the body content of a target markdown section.
 */
export const editNoteTool: MCPToolDefinition = {
	name: "edit_note",
	description: "Update only the target section body in a markdown note while preserving headings and frontmatter.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the note (e.g., 'folder/note.md' or 'note'). The .md extension is optional."
			},
			section: {
				type: "string",
				description: "Heading text of the target section (without leading #)."
			},
			level: {
				type: "number",
				description: "Optional heading level to disambiguate duplicate section names (1-6)."
			},
			mode: {
				type: "string",
				enum: ["replace", "append", "prepend", "patch"],
				description: "How to update the section body. Use patch to apply diff-match-patch against only the section body."
			},
			content: {
				type: "string",
				description: "Body content for replace/append/prepend modes."
			},
			patch: {
				type: "string",
				description: "diff-match-patch text format patch for patch mode; applied only to the target section body."
			},
			include_subsections: {
				type: "boolean",
				description: "If true, include subsection content in the update range.",
				default: false
			}
		},
		required: ["path", "section", "mode", "include_subsections"]
	},
	handler: async (args, context): Promise<MCPToolResult> => {
		const path = args.path as string;
		const section = (args.section as string | undefined)?.trim() ?? "";
		const level = typeof args.level === "number" ? args.level : undefined;
		const mode = args.mode as EditMode;
		const content = (args.content as string | undefined) ?? "";
		const patch = (args.patch as string | undefined) ?? "";
		const includeSubsections = Boolean(args.include_subsections);

		if (!section) {
			return {
				content: [{ type: "text", text: "Error: section is required." }],
				isError: true
			};
		}

		if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) {
			return {
				content: [{ type: "text", text: "Error: level must be an integer between 1 and 6." }],
				isError: true
			};
		}

		if (mode !== "replace" && mode !== "append" && mode !== "prepend" && mode !== "patch") {
			return {
				content: [{ type: "text", text: "Error: mode must be one of replace, append, prepend, patch." }],
				isError: true
			};
		}

		if ((mode === "replace" || mode === "append" || mode === "prepend") && typeof args.content !== "string") {
			return {
				content: [{ type: "text", text: "Error: content is required for replace, append, or prepend mode." }],
				isError: true
			};
		}

		if (mode === "patch" && typeof args.patch !== "string") {
			return {
				content: [{ type: "text", text: "Error: patch is required when mode=patch." }],
				isError: true
			};
		}

		const normalizedPath = normalizeNotePath(path);
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
			const currentContent = await context.vault.read(file);
			const { frontmatter, body } = splitFrontmatter(currentContent);
			const headings = findHeadings(body);
			const targetIndex = headings.findIndex((heading) => heading.text === section && (level === undefined || heading.level === level));

			if (targetIndex === -1) {
				return {
					content: [{ type: "text", text: `Error: Section "${section}" was not found.` }],
					isError: true
				};
			}

			const targetHeading = headings[targetIndex];
			if (!targetHeading) {
				return {
					content: [{ type: "text", text: `Error: Section "${section}" was not found.` }],
					isError: true
				};
			}
			const bodyStart = targetHeading.lineEnd < body.length && body[targetHeading.lineEnd] === "\n" ? targetHeading.lineEnd + 1 : targetHeading.lineEnd;

			let sectionEnd = body.length;
			for (let i = targetIndex + 1; i < headings.length; i += 1) {
				const candidate = headings[i];
				if (!candidate) {
					continue;
				}
				if (!includeSubsections || candidate.level <= targetHeading.level) {
					sectionEnd = candidate.start;
					break;
				}
			}

			const currentSectionBody = body.slice(bodyStart, sectionEnd);
			let nextSectionBody: string;
			if (mode === "replace") {
				nextSectionBody = content;
			} else if (mode === "append") {
				nextSectionBody = `${currentSectionBody}${content}`;
			} else if (mode === "prepend") {
				nextSectionBody = `${content}${currentSectionBody}`;
			} else {
				const patchResult = applyFuzzyPatch(currentSectionBody, patch);
				if (!patchResult.ok) {
					return {
						content: [{ type: "text", text: patchResult.error }],
						isError: true
					};
				}
				nextSectionBody = patchResult.content;
			}

			const nextBody = `${body.slice(0, bodyStart)}${nextSectionBody}${body.slice(sectionEnd)}`;
			const nextContent = mergeFrontmatter(frontmatter, nextBody);
			const beforeHash = stableHash(currentContent);
			const afterHash = stableHash(nextContent);
			const updated = nextContent !== currentContent;

			if (updated) {
				await context.vault.modify(file, nextContent);
			}

			const bodyStartInFile = frontmatter.length + bodyStart;
			const nextSectionEndInFile = frontmatter.length + bodyStart + Math.max(nextSectionBody.length - 1, 0);
			const startLine = lineNumberAt(nextContent, bodyStartInFile);
			const endLine = lineNumberAt(nextContent, nextSectionEndInFile);

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						updated,
						start_line: startLine,
						end_line: endLine,
						before_hash: beforeHash,
						after_hash: afterHash
					})
				}]
			};
		} catch (error) {
			return {
				content: [{
					type: "text",
					text: `Error applying section edit: ${error instanceof Error ? error.message : String(error)}`
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
