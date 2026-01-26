import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackagePath = path.join(rootDir, "package.json");

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
	writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`);
}

function parseSemver(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Invalid semver: ${version}`);
	}
	return match.slice(1).map((part) => Number(part));
}

function bumpVersion(current, kind) {
	const [major, minor, patch] = parseSemver(current);
	if (kind === "major") {
		return `${major + 1}.0.0`;
	}
	if (kind === "minor") {
		return `${major}.${minor + 1}.0`;
	}
	if (kind === "patch") {
		return `${major}.${minor}.${patch + 1}`;
	}
	throw new Error(`Unknown bump type: ${kind}`);
}

const bumpArg = process.argv[2];
if (!bumpArg) {
	throw new Error("Usage: node scripts/bump-version.mjs <x.y.z|major|minor|patch>");
}

const rootPackage = readJson(rootPackagePath);
const currentVersion = rootPackage.version ?? "0.0.0";
const nextVersion = ["major", "minor", "patch"].includes(bumpArg)
	? bumpVersion(currentVersion, bumpArg)
	: bumpArg;

parseSemver(nextVersion);
rootPackage.version = nextVersion;
writeJson(rootPackagePath, rootPackage);

await import(new URL("./sync-version.mjs", import.meta.url).href);
