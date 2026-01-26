import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prod = process.argv[2] === "production";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
	readFileSync(path.join(__dirname, "package.json"), "utf8")
);
const version = pkg.version ?? "0.0.0";

const context = await esbuild.context({
	banner: {
		js: "#!/usr/bin/env node\n",
	},
	entryPoints: ["src/index.ts"],
	bundle: true,
	format: "cjs",
	platform: "node",
	target: "node16",
	splitting: false,
	external: builtinModules,
	define: {
		__BRIDGE_VERSION__: JSON.stringify(version),
	},
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	outfile: "dist/obsidian-mcp.cjs",
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
