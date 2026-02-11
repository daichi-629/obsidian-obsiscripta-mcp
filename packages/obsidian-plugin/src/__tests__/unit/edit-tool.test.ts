import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { editNoteTool } from "../../mcp/tools/builtin/edit";

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
