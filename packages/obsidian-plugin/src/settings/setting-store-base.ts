/**
 * Event types for SettingStoreBase
 */
export type SettingStoreEvent = "change" | "load";

/**
 * Callback types for setting store events
 */
export type ChangeCallback<T> = (oldSettings: T, newSettings: T) => void;
export type LoadCallback<T> = (settings: T) => void;

/**
 * Event reference for unsubscribing from events.
 * Similar to Obsidian's EventRef pattern.
 */
export interface EventRef {
	unsubscribe(): void;
}

/**
	*value wise normalizer *
	*/
export interface SettingValueNormalizer<T> {
	normalize: (value: T[keyof T]) => T[keyof T];
}

/** value wise validation
*/
export interface SettingValueValidator<T> {
	validate: (value: T[keyof T]) => boolean;
}
/** whole settings validation
*/
export interface SettingValidator{
	validate: <T>(settings: T) => boolean;
}

/**
 * Helper type to extract keys that have array values.
 * This allows type-safe array operations on settings.
 */
type ArrayKeys<T> = {
	[K in keyof T]: T[K] extends unknown[] ? K : never;
}[keyof T];

/**
 * Helper type to extract the element type from an array property.
 */
type ArrayElement<T, K extends keyof T> = T[K] extends (infer U)[] ? U : never;

/**
 * A base class for managing application settings with load and change event handling.
 * This class is framework-agnostic and can be extended for specific implementations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class SettingStoreBase<T extends Record<string, any>> {
	protected settings: T;
	protected readonly DEFAULT_SETTINGS: T;
	private onChangeCallbacks: ChangeCallback<T>[] = [];
	private onLoadCallbacks: LoadCallback<T>[] = [];
	private settingValueNormalizers: Map<keyof T, SettingValueNormalizer<T>> = new Map(); 
	private settingValueValidators: Map<keyof T, SettingValueValidator<T>[]> = new Map();


	constructor(defaultSettings: T) {
		this.settings = { ...defaultSettings };
		this.DEFAULT_SETTINGS = defaultSettings;
	}

	/**
	 * Load settings from data source.
	 * Subclasses can override this to add normalization logic.
	 */
	async load(data: Partial<T>): Promise<void> {
		this.settings = Object.assign({}, this.DEFAULT_SETTINGS, data);
		this.notifyLoad();
	}

	/**
	 * Get current settings (read-only access).
	 */
	getSettings(): Readonly<T> {
		return this.settings;
	}

	/**
	 * Register an event listener.
	 * Returns an EventRef that can be used to unsubscribe.
	 */
	on(eventType: "change", callback: ChangeCallback<T>): EventRef;
	on(eventType: "load", callback: LoadCallback<T>): EventRef;
	on(
		eventType: SettingStoreEvent,
		callback: ChangeCallback<T> | LoadCallback<T>,
	): EventRef {
		if (eventType === "change") {
			const typedCallback = callback as ChangeCallback<T>;
			this.onChangeCallbacks.push(typedCallback);
			return {
				unsubscribe: () => {
					const index = this.onChangeCallbacks.indexOf(typedCallback);
					if (index > -1) {
						this.onChangeCallbacks.splice(index, 1);
					}
				},
			};
		} else if (eventType === "load") {
			const typedCallback = callback as LoadCallback<T>;
			this.onLoadCallbacks.push(typedCallback);
			return {
				unsubscribe: () => {
					const index = this.onLoadCallbacks.indexOf(typedCallback);
					if (index > -1) {
						this.onLoadCallbacks.splice(index, 1);
					}
				},
			};
		}
		// Should never reach here
		return { unsubscribe: () => {} };
	}

	/**
	 * Register a normalizer for a specific setting key.
	 * Normalizers are applied before validation during updateSetting.
	 */
	registerNormalizer<K extends keyof T>(
		key: K,
		normalizer: SettingValueNormalizer<T>,
	): void {
		this.settingValueNormalizers.set(key, normalizer);
	}

	/**
	 * Register a validator for a specific setting key.
	 * Multiple validators can be registered for the same key.
	 */
	registerValidator<K extends keyof T>(
		key: K,
		validator: SettingValueValidator<T>,
	): void {
		if (!this.settingValueValidators.has(key)) {
			this.settingValueValidators.set(key, []);
		}
		this.settingValueValidators.get(key)!.push(validator);
	}

	/**
	 * Update a specific setting.
	 * Subclasses should override this to add persistence logic.
	 */
	async updateSetting<K extends keyof T>(key: K, value: T[K]): Promise<void> {
		const oldSettings = { ...this.settings };
		const normalizer = this.settingValueNormalizers.get(key);
		if (normalizer) {
			value = normalizer.normalize(value) as T[K];
		}

		const validators = this.settingValueValidators.get(key)
		if (validators) {
			for (const validator of validators) {
				if (!validator.validate(value)) {
					//TODO: handle validation failure (e.g., throw error, log warning)
				}
			}
		}

		this.settings[key] = value;
		this.notifyChange(oldSettings, this.settings);
	}

	/**
	 * Add an element to an array setting if it doesn't already exist.
	 * This method ensures no duplicates are added to the array.
	 *
	 * @param key - The setting key that holds an array value
	 * @param value - The element to add to the array
	 */
	async addToArraySetting<K extends ArrayKeys<T>>(
		key: K,
		value: ArrayElement<T, K>,
	): Promise<void> {
		const array = this.settings[key] as ArrayElement<T, K>[];
		if (!array.includes(value)) {
			const oldSettings = { ...this.settings };
			this.settings[key] = [...array, value] as T[K];
			this.notifyChange(oldSettings, this.settings);
		}
	}

	/**
	 * Remove an element from an array setting.
	 *
	 * @param key - The setting key that holds an array value
	 * @param value - The element to remove from the array
	 */
	async removeFromArraySetting<K extends ArrayKeys<T>>(
		key: K,
		value: ArrayElement<T, K>,
	): Promise<void> {
		const oldSettings = { ...this.settings };
		const array = this.settings[key] as ArrayElement<T, K>[];
		this.settings[key] = array.filter((item) => item !== value) as T[K];
		this.notifyChange(oldSettings, this.settings);
	}

	/**
	 * Notify all change listeners.
	 */
	protected notifyChange(oldSettings: T, newSettings: T): void {
		for (const callback of this.onChangeCallbacks) {
			callback(oldSettings, newSettings);
		}
	}

	/**
	 * Notify all load listeners.
	 */
	protected notifyLoad(): void {
		for (const callback of this.onLoadCallbacks) {
			callback(this.settings);
		}
	}
}
