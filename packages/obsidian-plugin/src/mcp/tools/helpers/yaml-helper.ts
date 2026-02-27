import { parseYaml, stringifyYaml } from "obsidian";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractYamlBody(frontmatterBlock: string): string | null {
	const match = frontmatterBlock.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		return null;
	}
	return match[1] ?? "";
}

export function parseFrontmatterBlock(frontmatterBlock: string): { data: Record<string, unknown>; hasFrontmatter: boolean } | { error: string } {
	if (!frontmatterBlock) {
		return { data: {}, hasFrontmatter: false };
	}

	const yamlBody = extractYamlBody(frontmatterBlock);
	if (yamlBody === null) {
		return { error: "Error: Invalid frontmatter block." };
	}

	if (yamlBody.trim().length === 0) {
		return { data: {}, hasFrontmatter: true };
	}

	try {
		const parsed = parseYaml(yamlBody) as unknown;
		if (parsed == null) {
			return { data: {}, hasFrontmatter: true };
		}
		if (!isPlainObject(parsed)) {
			return { error: "Error: Frontmatter must be a YAML mapping." };
		}
		return { data: parsed, hasFrontmatter: true };
	} catch (error) {
		return { error: `Error: YAML parse error: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export function buildFrontmatterBlock(data: Record<string, unknown>): string {
	if (Object.keys(data).length === 0) {
		return "";
	}
	const yaml = stringifyYaml(data).trimEnd();
	return `---\n${yaml}\n---\n`;
}

export function deepMergeObjects(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const output: Record<string, unknown> = { ...target };
	for (const [key, value] of Object.entries(source)) {
		const existing = output[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			output[key] = deepMergeObjects(existing, value);
		} else {
			output[key] = value;
		}
	}
	return output;
}

export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a !== typeof b) {
		return false;
	}
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		if (a.length !== b.length) {
			return false;
		}
		return a.every((item, index) => deepEqual(item, b[index]));
	}
	if (isPlainObject(a)) {
		if (!isPlainObject(b)) {
			return false;
		}
		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);
		if (aKeys.length !== bKeys.length) {
			return false;
		}
		for (const key of aKeys) {
			if (!Object.prototype.hasOwnProperty.call(b, key)) {
				return false;
			}
			if (!deepEqual(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}
	return false;
}
