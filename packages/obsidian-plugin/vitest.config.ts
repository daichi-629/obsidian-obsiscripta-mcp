import { defineConfig } from "vitest/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
			"@obsiscripta/obsidian-script-loader": resolve(__dirname, "../obsidian-script-loader/src/index.ts"),
			"@obsiscripta/script-loader-core": resolve(__dirname, "../script-loader-core/src/index.ts"),
			obsidian: resolve(__dirname, "src/__tests__/mocks/obsidian.ts"),
		},
	},
	define: {
		__BRIDGE_VERSION__: JSON.stringify("test"),
	},
});
