import tseslint from 'typescript-eslint';
import globals from "globals";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...tseslint.configs.recommended,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			// Allow console methods in Obsidian adapters for debugging
			"no-console": ["error", { allow: ["log", "info", "warn", "error", "debug"] }],
			// Allow Node.js imports in path utils adapter
			"import/no-nodejs-modules": "off",
		},
	},
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"*.config.{js,mjs,ts,mts}",
		],
	},
);
