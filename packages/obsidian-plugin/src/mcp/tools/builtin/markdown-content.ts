interface MarkdownSections {
	frontmatter: string;
	body: string;
}

function stripFrontmatterDelimiters(frontmatter: string): string {
	return frontmatter
		.replace(/^---\r?\n/, "")
		.replace(/\r?\n---(?:\r?\n|$)$/, "");
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

export function mergeFrontmatter(frontmatter: string, body: string): string {
	if (!frontmatter) {
		return body;
	}

	return `${frontmatter}${body}`;
}

export function parseFrontmatterContent(frontmatter: string): string {
	return stripFrontmatterDelimiters(frontmatter);
}

export function buildFrontmatter(content: string): string {
	if (!content.trim()) {
		return "";
	}

	const normalized = content.endsWith("\n") ? content : `${content}\n`;
	return `---\n${normalized}---\n`;
}
