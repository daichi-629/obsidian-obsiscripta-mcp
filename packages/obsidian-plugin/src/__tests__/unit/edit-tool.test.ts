import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { editNoteTool } from "../../mcp/tools/builtin/edit";
import { editFrontmatterTool } from "../../mcp/tools/builtin/frontmatter";

function createTFile(path: string, basename: string): TFile {
	const file = new TFile();
	Object.assign(file, { path, basename });
	return file;
}

describe("edit_note tool", () => {
	it("applies patch to markdown body while preserving frontmatter", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "---\ntitle: Daily\n---\n# Entry\nToday\n";
		const patch = "@@ -2,6 +2,8 @@\n Entry%0A\n-Today%0A\n+Today%0A\n+Tomorrow%0A\n";

		const modify = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify,
			},
			app: {
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const result = await editNoteTool.handler({ path: "Notes/Daily", patch }, context);
		expect(result.isError).toBeUndefined();
		expect(modify).toHaveBeenCalledWith(noteFile, "---\ntitle: Daily\n---\n# Entry\nToday\nTomorrow\n");
	});
});

describe("edit_frontmatter tool", () => {
	it("reads specific frontmatter keys", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "---\ntitle: Daily\ntags:\n  - work\nstatus: draft\n---\n# Entry\nToday\n";

		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify: vi.fn(),
			},
			app: {
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const result = await editFrontmatterTool.handler({ path: "Notes/Daily", action: "read", keys: ["title"] }, context);
		const payload = JSON.parse((result.content?.[0] as { text: string }).text);
		expect(payload.frontmatter).toEqual({ title: "Daily" });
		expect(payload.updated).toBe(false);
		expect(context.vault.modify).not.toHaveBeenCalled();
	});

	it("merges frontmatter and preserves markdown body", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "---\ntitle: Daily\nstatus: draft\n---\n# Entry\nToday\n";

		const modify = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify,
			},
			app: {
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const result = await editFrontmatterTool.handler(
			{ path: "Notes/Daily", action: "merge", data: { status: "published", category: "journal" } },
			context
		);
		const payload = JSON.parse((result.content?.[0] as { text: string }).text);

		expect(payload.updated).toBe(true);
		expect(payload.frontmatter).toEqual({ title: "Daily", status: "published", category: "journal" });
		expect(modify).toHaveBeenCalledWith(
			noteFile,
			"---\ntitle: Daily\nstatus: published\ncategory: journal\n---\n# Entry\nToday\n"
		);
	});
});
