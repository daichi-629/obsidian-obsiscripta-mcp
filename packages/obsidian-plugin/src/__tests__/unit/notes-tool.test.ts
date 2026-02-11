import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import { readNoteTool } from "../../mcp/tools/builtin/notes";

function createTFile(path: string, basename: string): TFile {
	const file = new TFile();
	Object.assign(file, { path, basename });
	return file;
}

describe("read_note tool", () => {
	it("returns section payload as JSON and resolves wiki links", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const targetFile = createTFile("Projects/Plan.md", "Plan");

		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# Entry\nGo to [[Plan]] and [[Plan#Roadmap|roadmap section]]"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn().mockImplementation((linkPath: string) => {
						if (linkPath === "Plan") {
							return targetFile;
						}
						return null;
					}),
				},
			},
		} as any;

		const result = await readNoteTool.handler({ path: "Notes/Daily", section: "Entry", mode: "content" }, context);
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(
			JSON.stringify({
				title: "Entry",
				level: 1,
				content: "Go to [Plan](Projects/Plan.md) and [roadmap section](Projects/Plan.md#Roadmap)",
				start_line: 1,
				end_line: 2,
				truncated: false,
			}, null, 2),
		);
	});

	it("returns first matching heading when level is omitted", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# Target\nA\n## Target\nB"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn(),
				},
			},
		} as any;

		const result = await readNoteTool.handler({ path: "Notes/Daily", section: "Target", mode: "header" }, context);
		expect(result.content[0]?.text).toContain('"level": 1');
		expect(result.content[0]?.text).toContain('"start_line": 1');
	});

	it("removes frontmatter and can exclude subsection heading lines", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("---\ntitle: Daily\ntags:\n  - journal\n---\n# Entry\nToday\n## Sub\nChild"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn(),
				},
			},
		} as any;

		const result = await readNoteTool.handler({
			path: "Notes/Daily",
			section: "Entry",
			mode: "content",
			include_subsections: false,
		}, context);
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(
			JSON.stringify({
				title: "Entry",
				level: 1,
				content: "Today",
				start_line: 1,
				end_line: 4,
				truncated: false,
			}, null, 2),
		);
	});

	it("omits nested subsection content when include_subsections=false", async () => {
		const sourceFile = createTFile("Notes/Nested.md", "Nested");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# Root\nTop\n## Child\nInner\n### Grandchild\nDeep\nBack"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn(),
				},
			},
		} as any;

		const result = await readNoteTool.handler({
			path: "Notes/Nested",
			section: "Root",
			mode: "content",
			include_subsections: false,
		}, context);
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(
			JSON.stringify({
				title: "Root",
				level: 1,
				content: "Top",
				start_line: 1,
				end_line: 7,
				truncated: false,
			}, null, 2),
		);
	});

	it("returns error when section is not found", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# Entry\nToday"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn(),
				},
			},
		} as any;

		const result = await readNoteTool.handler({ path: "Notes/Daily", section: "Missing" }, context);
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toBe('Error: Section "Missing" not found.');
	});
});
