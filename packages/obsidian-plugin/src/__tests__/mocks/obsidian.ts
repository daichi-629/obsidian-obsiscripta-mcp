/**
 * Minimal mock of Obsidian API for testing.
 * Only implements what's actually used in the codebase.
 */

// EventRef for event subscription
export class EventRef {
	private _unsubscribe: () => void;

	constructor(unsubscribe: () => void) {
		this._unsubscribe = unsubscribe;
	}

	unsubscribe(): void {
		this._unsubscribe();
	}
}

// Notice for user notifications
export class Notice {
	constructor(public message: string) {}
}

// Platform detection
export const Platform = {
	isDesktopApp: true,
	isMobile: false,
};

// Minimal Vault interface
export interface Vault {
	adapter: any;
	read(file: any): Promise<string>;
	modify(file: any, data: string): Promise<void>;
	create(path: string, data: string): Promise<any>;
	delete(file: any): Promise<void>;
	getAbstractFileByPath(path: string): any;
	getMarkdownFiles(): any[];
}

// Minimal App interface
export interface App {
	vault: Vault;
	workspace: any;
	metadataCache: any;
}

// Plugin base class
export class Plugin {
	app!: App;
	manifest: any = {};

	async loadData(): Promise<any> {
		return null;
	}

	async saveData(data: any): Promise<void> {}

	registerEvent(eventRef: EventRef): void {}

	addSettingTab(tab: any): void {}

	addRibbonIcon(icon: string, title: string, callback: () => void): void {}

	addCommand(command: any): void {}
}

// Re-export types
export type TAbstractFile = any;
export type TFile = any;
export type TFolder = any;

// Path normalization function
export function normalizePath(path: string): string {
	// Simple normalization: trim, remove leading/trailing slashes
	return path.trim().replace(/^\/+|\/+$/g, "");
}
