import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import { getNoteOutlineTool } from "../../mcp/tools/builtin/note-outline";

function createTFile(path: string, basename: string): TFile {
	const file = new TFile();
	Object.assign(file, { path, basename });
	return file;
}

describe("get_note_outline tool", () => {
	it("returns ATX heading outline with same-level end lines", async () => {
		const sourceFile = createTFile("Notes/Structure.md", "Structure");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# A\ncontent\n## B\n### C\n## D\n# E")
			}
		} as any;

		const result = await getNoteOutlineTool.handler({ path: "Notes/Structure" }, context);
		expect(result.isError).toBeUndefined();

		const payload = JSON.parse(result.content[0]?.text ?? "{}");
		expect(payload.outline).toEqual([
			{
				heading: "A",
				level: 1,
				start_line: 1,
				end_line: 5,
				id: expect.any(String)
			},
			{
				heading: "B",
				level: 2,
				start_line: 3,
				end_line: 4,
				id: expect.any(String)
			},
			{
				heading: "C",
				level: 3,
				start_line: 4,
				end_line: 6,
				id: expect.any(String)
			},
			{
				heading: "D",
				level: 2,
				start_line: 5,
				end_line: 6,
				id: expect.any(String)
			},
			{
				heading: "E",
				level: 1,
				start_line: 6,
				end_line: 6,
				id: expect.any(String)
			}
		]);
	});

	it("excludes frontmatter headings by default", async () => {
		const sourceFile = createTFile("Notes/Structure.md", "Structure");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("---\ntitle: test\n# ignored\n---\n# Included")
			}
		} as any;

		const result = await getNoteOutlineTool.handler({ path: "Notes/Structure" }, context);
		const payload = JSON.parse(result.content[0]?.text ?? "{}");
		expect(payload.outline).toHaveLength(1);
		expect(payload.outline[0]?.heading).toBe("Included");
		expect(payload.outline[0]?.start_line).toBe(5);
	});

	it("filters by max depth and can ignore headings inside code fences", async () => {
		const sourceFile = createTFile("Notes/Structure.md", "Structure");
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("# Top\n```md\n## hidden\n```\n## Visible\n### Too deep")
			}
		} as any;

		const result = await getNoteOutlineTool.handler(
			{ path: "Notes/Structure", include_codeblocks: false, max_depth: 2 },
			context
		);
		const payload = JSON.parse(result.content[0]?.text ?? "{}");
		expect(payload.outline).toHaveLength(2);
		expect(payload.outline.map((item: { heading: string }) => item.heading)).toEqual(["Top", "Visible"]);
	});
});
