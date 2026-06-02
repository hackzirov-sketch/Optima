import { rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(__dirname, "..", "dist");

const EMOJI_DIR_PATTERN = /^(Animated|Static)-Emoji/i;

let removed = 0;
let savedBytes = 0;

for (const entry of readdirSync(distDir)) {
  const fullPath = join(distDir, entry);
  if (EMOJI_DIR_PATTERN.test(entry) && statSync(fullPath).isDirectory()) {
    const size = getDirSize(fullPath);
    rmSync(fullPath, { recursive: true, force: true });
    removed++;
    savedBytes += size;
    console.log(`  removed ${entry} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function getDirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += getDirSize(full);
    else total += statSync(full).size;
  }
  return total;
}

console.log(`\nCleaned up ${removed} emoji directories, saved ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`dist size: ${(getDirSize(distDir) / 1024 / 1024).toFixed(1)} MB`);
