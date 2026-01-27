import tseslint from 'typescript-eslint';
import globals from "globals";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.node,
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
		},
	},
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"*.config.{js,mjs,ts,mts}",
			"*.d.ts",
		],
	},
);
