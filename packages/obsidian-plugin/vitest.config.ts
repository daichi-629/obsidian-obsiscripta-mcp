import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/__tests__/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/plugin/**", "src/settings/**"],
			exclude: ["**/__tests__/**", "**/*.test.ts"],
		},
	},
	resolve: {
		alias: {
			obsidian: resolve(__dirname, "src/__tests__/mocks/obsidian.ts"),
		},
	},
	define: {
		__BRIDGE_VERSION__: JSON.stringify("test"),
	},
});
