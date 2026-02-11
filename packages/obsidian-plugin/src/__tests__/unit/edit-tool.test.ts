import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { editNoteTool } from "../../mcp/tools/builtin/edit";

function createTFile(path: string, basename: string): TFile {
	const file = new TFile();
	Object.assign(file, { path, basename });
	return file;
}

describe("edit_note tool", () => {
	it("replaces only target section body while preserving frontmatter and heading", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "---\ntitle: Daily\n---\n# Entry\nToday\n## Child\nKeep\n";

		const modify = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify
			}
		} as any;

		const result = await editNoteTool.handler(
			{
				path: "Notes/Daily",
				section: "Entry",
				mode: "replace",
				content: "Updated\n",
				include_subsections: false
			},
			context
		);

		expect(result.isError).toBeUndefined();
		expect(modify).toHaveBeenCalledWith(noteFile, "---\ntitle: Daily\n---\n# Entry\nUpdated\n## Child\nKeep\n");
		const responseItem = result.content[0];
		expect(responseItem?.type).toBe("text");
		const payload = JSON.parse((responseItem as any).text);
		expect(payload.updated).toBe(true);
		expect(payload.before_hash).not.toBe(payload.after_hash);
	});

	it("supports section-local patch mode", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "# Entry\nToday\nTomorrow\n# Next\nAfter\n";
		const patch = "@@ -1,15 +1,14 @@\n Today%0A\n-Tomorrow%0A\n+Soon%0A\n";

		const modify = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify
			}
		} as any;

		const result = await editNoteTool.handler(
			{
				path: "Notes/Daily",
				section: "Entry",
				mode: "patch",
				patch,
				include_subsections: false
			},
			context
		);

		expect(result.isError).toBeUndefined();
		expect(modify).toHaveBeenCalledWith(noteFile, "# Entry\nToday\nSoon\n# Next\nAfter\n");
	});

	it("appends including subsections when include_subsections=true", async () => {
		const noteFile = createTFile("Notes/Daily.md", "Daily");
		const currentNote = "# Entry\nTop\n## Child\nNested\n# Next\nAfter\n";

		const modify = vi.fn();
		const context = {
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(noteFile),
				read: vi.fn().mockResolvedValue(currentNote),
				modify
			}
		} as any;

		await editNoteTool.handler(
			{
				path: "Notes/Daily",
				section: "Entry",
				mode: "append",
				content: "Added\n",
				include_subsections: true
			},
			context
		);

		expect(modify).toHaveBeenCalledWith(noteFile, "# Entry\nTop\n## Child\nNested\nAdded\n# Next\nAfter\n");
	});
});
