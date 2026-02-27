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
		const patch = "--- a/body.md\n+++ b/body.md\n@@ -1,2 +1,3 @@\n # Entry\n Today\n+Tomorrow\n";

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

	it("creates a note from a headerless unified diff with correct newlines", async () => {
		const create = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(null),
				read: vi.fn(),
				modify: vi.fn(),
				create,
			},
			app: {
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const patch = "@@ -0,0 +1,3 @@\n+Line 1\n+Line 2\n+Line 3\n";
		const result = await editNoteTool.handler({ path: "Notes/New", patch, create: true }, context);
		expect(result.isError).toBeUndefined();
		expect(create).toHaveBeenCalledWith("Notes/New.md", "Line 1\nLine 2\nLine 3");
	});

	it("accepts git-style headers in patch", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "# Entry\nToday\n";
		const patch = "diff --git a/body.md b/body.md\n--- a/body.md\n+++ b/body.md\n@@ -1,2 +1,3 @@\n # Entry\n Today\n+Tomorrow\n";

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
		expect(modify).toHaveBeenCalledWith(noteFile, "# Entry\nToday\nTomorrow\n");
	});
});
