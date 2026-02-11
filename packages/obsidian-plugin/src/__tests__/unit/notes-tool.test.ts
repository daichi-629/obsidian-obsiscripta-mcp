import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
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

describe("read_note tool", () => {
	it("resolves wiki links when resolveLinks=true", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const targetFile = createTFile("Projects/Plan.md", "Plan");

		const context = {
			session: createSessionContext(),
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("Go to [[Plan]] and [[Plan#Roadmap|roadmap section]]"),
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

		const result = await readNoteTool.handler({ path: "Notes/Daily", resolveLinks: true }, context);
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(
			"Go to [Plan](Projects/Plan.md) and [roadmap section](Projects/Plan.md#Roadmap)",
		);
	});

	it("keeps original markdown when resolveLinks is omitted", async () => {
		const sourceFile = createTFile("Notes/Daily.md", "Daily");
		const context = {
			session: createSessionContext(),
			vault: {
				getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
				read: vi.fn().mockResolvedValue("Go to [[Plan]]"),
			},
			app: {
				metadataCache: {
					getFirstLinkpathDest: vi.fn().mockReturnValue(createTFile("Projects/Plan.md", "Plan")),
				},
			},
		} as any;

		const result = await readNoteTool.handler({ path: "Notes/Daily" }, context);
		expect(result.content[0]?.text).toBe("Go to [[Plan]]");
	});
});
