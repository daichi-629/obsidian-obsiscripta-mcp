import { Lexer, Token, Tokens } from 'marked';

/**
 * Markdown sections split by frontmatter
 */
export interface MarkdownSections {
	frontmatter: string;
	body: string;
}

/**
 * Heading information extracted from markdown
 */
export interface HeadingInfo {
	level: number;
	text: string;
	depth: number;
	raw: string;
}

/**
 * Heading information with source position details.
 */
export interface HeadingPosition extends HeadingInfo {
	/**
	 * Zero-based line index where the heading starts.
	 */
	lineIndex: number;
	/**
	 * One-based line number where the heading starts.
	 */
	lineNumber: number;
	/**
	 * Zero-based character offset where the heading starts.
	 */
	offset: number;
}

/**
 * Heading tree node for hierarchical structure
 */
export interface HeadingNode {
	level: number;
	text: string;
	depth: number;
	raw: string;
	children: HeadingNode[];
}

/**
 * Splits markdown into frontmatter (if present) and body content.
 * Only treats YAML frontmatter at the very top of the file as frontmatter.
 */
export function splitFrontmatter(markdown: string): MarkdownSections {
	const normalized = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;
	const frontmatterMatch = normalized.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);

	if (!frontmatterMatch) {
		return {
			frontmatter: "",
			body: normalized
		};
	}

	const frontmatter = frontmatterMatch[0];
	const body = normalized.slice(frontmatter.length);

	return {
		frontmatter,
		body
	};
}

/**
 * Returns the line range covered by frontmatter (1-based, inclusive).
 */
export function getFrontmatterLineRange(markdown: string): { start: number; end: number } | null {
	const { frontmatter } = splitFrontmatter(markdown);

	if (!frontmatter) {
		return null;
	}

	const frontmatterLineCount = frontmatter.split(/\r?\n/).length - 1;

	return {
		start: 1,
		end: Math.max(frontmatterLineCount, 1)
	};
}

/**
 * Build zero-based line start offsets for a markdown string.
 */
export function buildLineOffsets(markdown: string): number[] {
	const offsets: number[] = [0];
	for (let i = 0; i < markdown.length; i += 1) {
		if (markdown[i] === "\n") {
			offsets.push(i + 1);
		}
	}
	return offsets;
}

/**
 * Convert a character offset to a zero-based line index using precomputed offsets.
 */
export function findLineIndex(offsets: number[], offset: number): number {
	let low = 0;
	let high = offsets.length - 1;
	let result = 0;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const start = offsets[mid]!;
		const nextStart = mid + 1 < offsets.length ? offsets[mid + 1]! : Number.POSITIVE_INFINITY;

		if (offset >= start && offset < nextStart) {
			result = mid;
			break;
		}

		if (offset < start) {
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}

	return result;
}

/**
 * Merges frontmatter and body content back into a single markdown string
 */
export function mergeFrontmatter(frontmatter: string, body: string): string {
	if (!frontmatter) {
		return body;
	}

	return `${frontmatter}${body}`;
}

/**
 * Lexer instance for markdown parsing
 */
const lexer = new Lexer();

/**
 * Parse markdown content into tokens using marked's Lexer
 */
export function parseMarkdown(markdown: string): Token[] {
	return lexer.lex(markdown);
}

/**
 * Extract all headings from markdown content as a flat list
 */
export function extractHeadings(markdown: string): HeadingInfo[] {
	const tokens = parseMarkdown(markdown);
	const headings: HeadingInfo[] = [];

	function extractFromTokens(tokens: Token[]): void {
		for (const token of tokens) {
			if (token.type === 'heading') {
				const headingToken = token as Tokens.Heading;
				headings.push({
					level: headingToken.depth,
					text: headingToken.text,
					depth: headingToken.depth,
					raw: headingToken.raw
				});
			}

			// Recursively process nested tokens (like in lists, blockquotes, etc.)
			if ('tokens' in token && Array.isArray(token.tokens)) {
				extractFromTokens(token.tokens);
			}
		}
	}

	extractFromTokens(tokens);
	return headings;
}

/**
 * Extract all headings and their source positions.
 *
 * - Positions are derived from the raw heading text as emitted by the markdown lexer.
 * - If a heading token does not include raw text or the raw text cannot be found,
 *   that heading is skipped.
 */
export function extractHeadingsWithPositions(markdown: string): HeadingPosition[] {
	const tokens = parseMarkdown(markdown);
	const headingTokens: Tokens.Heading[] = [];

	function collectTokens(tokens: Token[]): void {
		for (const token of tokens) {
			if (token.type === 'heading') {
				headingTokens.push(token as Tokens.Heading);
			}
			if ('tokens' in token && Array.isArray(token.tokens)) {
				collectTokens(token.tokens);
			}
		}
	}

	collectTokens(tokens);

	if (headingTokens.length === 0) {
		return [];
	}

	const lineOffsets = buildLineOffsets(markdown);

	const headings: HeadingPosition[] = [];
	let searchIndex = 0;

	for (const headingToken of headingTokens) {
		const raw = headingToken.raw ?? "";
		if (!raw) {
			continue;
		}

		const matchIndex = markdown.indexOf(raw, searchIndex);
		if (matchIndex === -1) {
			continue;
		}

		const lineIndex = findLineIndex(lineOffsets, matchIndex);
		headings.push({
			level: headingToken.depth,
			text: headingToken.text,
			depth: headingToken.depth,
			raw,
			lineIndex,
			lineNumber: lineIndex + 1,
			offset: matchIndex
		});

		searchIndex = matchIndex + raw.length;
	}

	return headings;
}

/**
 * Extract ATX-style headings that appear inside fenced code blocks.
 */
export function extractHeadingsFromCodeBlocks(markdown: string): HeadingPosition[] {
	const codeTokens = getTokensByType(markdown, "code");
	if (codeTokens.length === 0) {
		return [];
	}

	const lineOffsets = buildLineOffsets(markdown);
	const headingRegex = /^\s{0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/;
	const headings: HeadingPosition[] = [];
	let searchIndex = 0;

	for (const token of codeTokens) {
		const raw = (token as { raw?: string }).raw ?? "";
		if (!raw) {
			continue;
		}

		const matchIndex = markdown.indexOf(raw, searchIndex);
		if (matchIndex === -1) {
			continue;
		}
		searchIndex = matchIndex + raw.length;

		const fenceMatch = raw.match(/^ {0,3}([`~]{3,})[^\n]*\r?\n([\s\S]*?)\r?\n {0,3}\1[^\n]*\r?\n?$/);
		if (!fenceMatch) {
			continue;
		}

		const firstNewlineIndex = raw.search(/\r?\n/);
		if (firstNewlineIndex === -1) {
			continue;
		}

		const openingEndIndex = firstNewlineIndex + (raw[firstNewlineIndex] === "\r" ? 2 : 1);
		const contentRaw = fenceMatch[2] ?? "";
		const contentStartInRaw = raw.indexOf(contentRaw, openingEndIndex);
		if (contentStartInRaw === -1) {
			continue;
		}

		let cursor = 0;
		let offsetWithinContent = 0;

		while (cursor <= contentRaw.length) {
			const nextBreak = contentRaw.indexOf("\n", cursor);
			const lineEnd = nextBreak === -1 ? contentRaw.length : (nextBreak > 0 && contentRaw[nextBreak - 1] === "\r" ? nextBreak - 1 : nextBreak);
			const newlineLength = nextBreak === -1 ? 0 : (nextBreak > 0 && contentRaw[nextBreak - 1] === "\r" ? 2 : 1);
			const line = contentRaw.slice(cursor, lineEnd);

			const headingMatch = line.match(headingRegex);
			if (headingMatch) {
				const level = headingMatch[1]?.length ?? 0;
				const headingText = headingMatch[2]?.trim() ?? "";
				const absoluteOffset = matchIndex + contentStartInRaw + offsetWithinContent;
				const lineIndex = findLineIndex(lineOffsets, absoluteOffset);

				headings.push({
					level,
					text: headingText,
					depth: level,
					raw: line,
					lineIndex,
					lineNumber: lineIndex + 1,
					offset: absoluteOffset
				});
			}

			if (nextBreak === -1) {
				break;
			}

			offsetWithinContent += line.length + newlineLength;
			cursor = nextBreak + 1;
		}
	}

	return headings;
}

/**
 * Extract headings as a hierarchical tree structure
 */
export function extractHeadingTree(markdown: string): HeadingNode[] {
	const headings = extractHeadings(markdown);
	const root: HeadingNode[] = [];
	const stack: HeadingNode[] = [];

	for (const heading of headings) {
		const node: HeadingNode = {
			level: heading.level,
			text: heading.text,
			depth: heading.depth,
			raw: heading.raw,
			children: []
		};

		// Find the parent node in the stack
		while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
			stack.pop();
		}

		if (stack.length === 0) {
			// This is a root-level heading
			root.push(node);
		} else {
			// Add as a child to the last item in stack
			stack[stack.length - 1]!.children.push(node);
		}

		stack.push(node);
	}

	return root;
}

/**
 * Get all tokens of a specific type from markdown
 */
export function getTokensByType<T extends Token['type']>(
	markdown: string,
	type: T
): Extract<Token, { type: T }>[] {
	const tokens = parseMarkdown(markdown);
	const results: Extract<Token, { type: T }>[] = [];

	function searchTokens(tokens: Token[]): void {
		for (const token of tokens) {
			if (token.type === type) {
				results.push(token as Extract<Token, { type: T }>);
			}

			if ('tokens' in token && Array.isArray(token.tokens)) {
				searchTokens(token.tokens);
			}
		}
	}

	searchTokens(tokens);
	return results;
}
