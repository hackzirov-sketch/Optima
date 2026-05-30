import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(projectRoot, "public");
const outputFile = path.join(projectRoot, "src", "data", "emojis.generated.ts");
const outputJsonFile = path.join(projectRoot, "src", "data", "emojis.generated.json");

const STATIC_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);
const ANIMATED_IMAGE_EXTENSIONS = new Set([".gif", ".webp", ".apng"]);
const LOTTIE_EXTENSIONS = new Set([".json", ".tgs", ".lottie"]);
const ALL_EXTENSIONS = new Set([...STATIC_EXTENSIONS, ...ANIMATED_IMAGE_EXTENSIONS, ...LOTTIE_EXTENSIONS]);

const TELEGRAM_PACK_PATTERN = /^(Animated|Static)(-|\s+)Emoji/i;
const TELEGRAM_PART_PATTERN = /part[-\s]*(\d+)/i;

function sanitizeToken(value, fallback = "emoji") {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function publicPath(filePath) {
  return `/${path.relative(publicRoot, filePath).split(path.sep).join("/")}`;
}

function detectPart(relativePath) {
  const match = String(relativePath).match(/(?:^|[/\\\s_-])part[\s_-]*(\d+)/i);
  return match ? `part-${match[1]}` : undefined;
}

function makeKeywords(filePath) {
  const parsed = path.parse(filePath);
  const raw = parsed.name.replace(/[-_]+/g, " ");
  return Array.from(new Set(raw.split(/[^a-zA-Z0-9]+/).map((part) => part.toLowerCase()).filter(Boolean))).slice(0, 8);
}

function detectCategory(relativePath) {
  const segments = String(relativePath).split(/[\\/]+/).filter(Boolean);
  const parent = segments.length > 1 ? segments[segments.length - 2] : "emoji";
  return sanitizeToken(parent, "emoji");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && ALL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function createUniqueId(base, usedIds) {
  let id = base;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

function isTelegramPack(relativePath) {
  const segments = String(relativePath).split(/[\\/]+/);
  return segments.some((seg) => TELEGRAM_PACK_PATTERN.test(seg));
}

function detectTelegramPackType(relativePath) {
  if (!isTelegramPack(relativePath)) return undefined;
  const segments = String(relativePath).split(/[\\/]+/);
  const packDir = segments.find((seg) => TELEGRAM_PACK_PATTERN.test(seg)) ?? "";
  const trimmed = packDir.trim().replace(/-/g, " ");
  if (/^animated/i.test(trimmed)) return "animated";
  if (/^static/i.test(trimmed)) return "static";
  return "static";
}

async function buildManifest() {
  const topDirs = await readdir(publicRoot, { withFileTypes: true });
  const scanDirs = [];

  for (const entry of topDirs) {
    const name = entry.name.trim();
    if (name === "emojis" || name === "openmoji") {
      scanDirs.push(path.join(publicRoot, entry.name));
    } else if (TELEGRAM_PACK_PATTERN.test(name)) {
      scanDirs.push(path.join(publicRoot, entry.name));
    }
  }

  const sourceFiles = [];
  for (const dir of scanDirs) {
    sourceFiles.push(...(await walk(dir)));
  }

  const byBasename = new Map();
  for (const filePath of sourceFiles) {
    const key = path.join(path.dirname(filePath), path.parse(filePath).name).toLowerCase();
    const current = byBasename.get(key) ?? [];
    current.push(filePath);
    byBasename.set(key, current);
  }

  const usedIds = new Set();
  const items = [];

  for (const filePath of sourceFiles.sort((a, b) => a.localeCompare(b))) {
    const extension = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(publicRoot, filePath);
    const siblings = byBasename.get(path.join(path.dirname(filePath), path.parse(filePath).name).toLowerCase()) ?? [];

    const packType = detectTelegramPackType(relativePath);
    const isTelegram = packType !== undefined;
    const isLottie = LOTTIE_EXTENSIONS.has(extension);
    const hasLottieSibling = siblings.some((s) => LOTTIE_EXTENSIONS.has(path.extname(s).toLowerCase()));
    const isStaticPreview = STATIC_EXTENSIONS.has(extension) && !ANIMATED_IMAGE_EXTENSIONS.has(extension);

    if (isTelegram) {
      if (isLottie) continue;
      if (!isStaticPreview) continue;
    } else {
      if (isStaticPreview && hasLottieSibling) continue;
    }

    const hasAnimatedSource = ANIMATED_IMAGE_EXTENSIONS.has(extension) || isLottie;

    const previewFile =
      hasAnimatedSource
        ? siblings.find((sibling) => {
            const siblingExt = path.extname(sibling).toLowerCase();
            return STATIC_EXTENSIONS.has(siblingExt) && !LOTTIE_EXTENSIONS.has(siblingExt);
          }) ?? (ANIMATED_IMAGE_EXTENSIONS.has(extension) ? filePath : undefined)
        : filePath;

    if (!previewFile) continue;

    const parsed = path.parse(filePath);
    const type = isTelegram ? packType : (hasAnimatedSource ? "animated" : "static");
    const baseId = isTelegram
      ? `${type}-telegram-${sanitizeToken(parsed.name)}`
      : `${type}-${sanitizeToken(path.relative(publicRoot, path.join(parsed.dir, parsed.name)))}`;
    const uniqueId = createUniqueId(baseId, usedIds);

    let animationSrc = hasAnimatedSource ? publicPath(filePath) : undefined;
    if (isTelegram && packType === "animated" && !hasAnimatedSource) {
      const lottieSibling = siblings.find((s) => {
        const ext = path.extname(s).toLowerCase();
        return ext === ".json" || ext === ".lottie";
      });
      if (lottieSibling) {
        animationSrc = publicPath(lottieSibling);
      }
    }

    const size = await stat(filePath);

    items.push({
      id: uniqueId,
      name: parsed.name.replace(/[-_]+/g, " "),
      type,
      category: isTelegram ? type : detectCategory(relativePath),
      previewSrc: publicPath(previewFile),
      animationSrc,
      keywords: makeKeywords(filePath),
      part: detectPart(relativePath),
      bytes: size.size,
    });
  }

  return items;
}

const emojis = await buildManifest();
const totalBytes = emojis.reduce((sum, item) => sum + item.bytes, 0);
const generatedAt = new Date().toISOString();

const body = `/* eslint-disable */
// Auto-generated by scripts/generate-emojis.mjs. Do not edit manually.

export type GeneratedEmoji = {
  id: string;
  name: string;
  type: "static" | "animated";
  category: string;
  previewSrc: string;
  animationSrc?: string;
  keywords: string[];
  part?: string;
  bytes: number;
};

export const GENERATED_EMOJI_META = ${JSON.stringify({ generatedAt, count: emojis.length, totalBytes, totalAnimated: emojis.filter((e) => e.type === "animated").length, totalStatic: emojis.filter((e) => e.type === "static").length }, null, 2)} as const;

export const GENERATED_EMOJIS = ${JSON.stringify(emojis, null, 2)} as const satisfies readonly GeneratedEmoji[];

export const GENERATED_EMOJI_BY_ID = Object.fromEntries(GENERATED_EMOJIS.map((emoji) => [emoji.id, emoji])) as Record<string, GeneratedEmoji>;

export const GENERATED_EMOJI_CATEGORIES = Array.from(new Set(GENERATED_EMOJIS.map((e) => e.category).filter(Boolean).sort())) as readonly string[];
`;

await writeFile(outputFile, body, "utf8");
await writeFile(outputJsonFile, `${JSON.stringify({ meta: { generatedAt, count: emojis.length, totalBytes, totalAnimated: emojis.filter((e) => e.type === "animated").length, totalStatic: emojis.filter((e) => e.type === "static").length }, emojis }, null, 2)}\n`, "utf8");
console.log(`Generated ${emojis.length} emojis (${Math.round(totalBytes / 1024)} KB) -> ${path.relative(projectRoot, outputJsonFile)}`);
