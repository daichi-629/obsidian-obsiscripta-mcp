import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import { editNoteTool } from "../../mcp/tools/builtin/edit";
import { readNoteTool } from "../../mcp/tools/builtin/notes";

function createTFile(path: string, basename: string): TFile {
	const file = new TFile();
	Object.assign(file, { path, basename });
	return file;
}

function createSessionContext() {
	const store = new Map<string, unknown>();
	return {
		get: (key: string): unknown => store.get(key),
		set: (key: string, value: unknown): void => {
			store.set(key, value);
		},
		delete: (key: string): boolean => store.delete(key),
		has: (key: string): boolean => store.has(key),
		clear: (): void => {
			store.clear();
		},
	};
}

describe("edit_note session guard", () => {
	it("returns an error when edit_note is called before read_note in a session", async () => {
		const file = createTFile("Notes/Test.md", "Test");
		const session = createSessionContext();
		const context = {
			session,
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(file),
				read: vi.fn().mockResolvedValue("Hello"),
				modify: vi.fn(),
			},
			app: {
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const result = await editNoteTool.handler({
			path: "Notes/Test",
			patch: "@@ -1,5 +1,11 @@\n Hello\n+ world\n",
		}, context);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("Call read_note");
		expect(context.vault.modify).not.toHaveBeenCalled();
	});

	it("allows edit_note after read_note in the same session", async () => {
		const file = createTFile("Notes/Test.md", "Test");
		const patch = "@@ -1,5 +1,11 @@\n Hello\n+ world\n";

		const session = createSessionContext();
		const context = {
			session,
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(file),
				read: vi.fn().mockResolvedValue("Hello"),
				modify: vi.fn().mockResolvedValue(undefined),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn(),
				},
				fileManager: {
					trashFile: vi.fn(),
				},
			},
		} as any;

		const readResult = await readNoteTool.handler({ path: "Notes/Test" }, context);
		expect(readResult.isError).toBeUndefined();

		const editResult = await editNoteTool.handler({ path: "Notes/Test", patch }, context);
		expect(editResult.isError).toBeUndefined();
		expect(context.vault.modify).toHaveBeenCalledWith(file, "Hello world");
	});
});
