import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
	writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`);
}

const rootPackagePath = path.join(rootDir, "package.json");
const rootPackage = readJson(rootPackagePath);
const rootVersion = rootPackage.version;

if (!rootVersion) {
	throw new Error("Root package.json is missing a version.");
}

const packageFiles = [
	"packages/obsidian-plugin/package.json",
	"packages/stdio-bridge/package.json",
	"packages/shared/package.json",
];

for (const relativePath of packageFiles) {
	const filePath = path.join(rootDir, relativePath);
	const pkg = readJson(filePath);
	pkg.version = rootVersion;
	writeJson(filePath, pkg);
}

const manifestPath = path.join(rootDir, "packages/obsidian-plugin/manifest.json");
const manifest = readJson(manifestPath);
manifest.version = rootVersion;
writeJson(manifestPath, manifest);

const versionsPath = path.join(rootDir, "packages/obsidian-plugin/versions.json");
const versions = readJson(versionsPath);
if (!manifest.minAppVersion) {
	throw new Error("manifest.json is missing minAppVersion.");
}
versions[rootVersion] = manifest.minAppVersion;
writeJson(versionsPath, versions);
