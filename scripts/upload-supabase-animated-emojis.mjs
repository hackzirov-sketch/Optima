import { readFile } from "node:fs/promises";
import path from "node:path";

const projectUrl = process.env.SUPABASE_URL;
const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const root = path.resolve(process.argv[2] || path.join(process.env.TEMP, "optima-animated-emojis-v1"));
const concurrency = Number(process.env.EMOJI_UPLOAD_CONCURRENCY || 10);

if (!projectUrl || !apiKey) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const queue = [...manifest];
let uploaded = 0;

async function uploadObject(objectPath, body, contentType, cacheControl = "31536000") {
  const response = await fetch(`${projectUrl}/storage/v1/object/optima-emojis/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "x-upsert": "false"
    },
    body
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status !== 409 && !detail.includes("KeyAlreadyExists")) {
      throw new Error(`${objectPath}: ${response.status} ${detail}`);
    }
  }
}

async function worker() {
  while (queue.length) {
    const asset = queue.shift();
    const extension = asset.format === "lottie" ? "lottie" : "webp";
    const previewExtension = asset.format === "webp" ? "webp" : "png";
    await Promise.all([
      uploadObject(`animated/v1/${asset.id}.${extension}`, await readFile(path.join(root, `${asset.id}.${extension}`)),
        asset.format === "lottie" ? "application/zip" : "image/webp"),
      uploadObject(`animated/v1/previews/${asset.id}.${previewExtension}`,
        await readFile(path.join(root, "previews", `${asset.id}.${previewExtension}`)),
        previewExtension === "png" ? "image/png" : "image/webp")
    ]);
    uploaded++;
    if (uploaded % 50 === 0 || uploaded === manifest.length) process.stdout.write(`Uploaded ${uploaded}/${manifest.length}\n`);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const base = `${projectUrl}/storage/v1/object/public/optima-emojis/animated/v1`;
const publicManifest = manifest.map((asset) => ({
  ...asset,
  src: `${base}/${asset.id}.${asset.format}`,
  previewSrc: `${base}/previews/${asset.id}.${asset.format === "webp" ? "webp" : "png"}`
}));
await uploadObject("animated/v1/manifest.json", Buffer.from(JSON.stringify(publicManifest)), "application/json", "3600");
process.stdout.write(`Done: ${manifest.length} animated emoji assets and previews uploaded\n`);
