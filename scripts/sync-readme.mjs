import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "README.md");
const targetDir = path.join(rootDir, "cloudflare", "web");
const targetPath = path.join(targetDir, "readme.md");

await mkdir(targetDir, { recursive: true });
await copyFile(sourcePath, targetPath);

console.log(`Synced README: ${sourcePath} -> ${targetPath}`);
