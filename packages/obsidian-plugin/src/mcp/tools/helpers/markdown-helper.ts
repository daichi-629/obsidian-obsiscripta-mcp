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
