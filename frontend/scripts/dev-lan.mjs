// `npm run dev:lan` — the dev server over HTTPS, reachable from other devices.
//
// Browsers only expose the camera, microphone and WebCrypto to secure
// contexts: https://, or http://localhost. Opened from another machine as
// http://192.168.x.x:5173 the meeting page gets no navigator.mediaDevices and
// no crypto.subtle — no camera, no microphone, no encrypted chat. This makes a
// self-signed certificate for localhost and every LAN address of this machine
// (regenerated when they change) and starts Vite with it. Each device has to
// accept the certificate warning once.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".cert");
const key = join(dir, "dev-key.pem");
const cert = join(dir, "dev-cert.pem");
const stamp = join(dir, "hosts.txt");

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4")
  .map((net) => net.address);
const hosts = ["localhost", ...new Set(["127.0.0.1", ...ips])];
const wanted = hosts.join(",");

if (!existsSync(cert) || !existsSync(key) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== wanted) {
  mkdirSync(dir, { recursive: true });
  const san = hosts.map((host) => (/^\d+\.\d+\.\d+\.\d+$/.test(host) ? `IP:${host}` : `DNS:${host}`)).join(",");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825",
    "-keyout", key, "-out", cert, "-subj", "/CN=Optima dev",
    "-addext", `subjectAltName=${san}`,
  ], { stdio: "ignore" });
  writeFileSync(stamp, wanted);
  console.log(`[dev:lan] new certificate for ${hosts.join(", ")}`);
}

const port = process.env.PORT || "5173";
console.log(`[dev:lan] open from other devices: ${ips.filter((ip) => ip !== "127.0.0.1").map((ip) => `https://${ip}:${port}`).join("  ")}`);
const vite = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "--host", "0.0.0.0", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DEV_HTTPS_KEY: key, DEV_HTTPS_CERT: cert },
});
vite.on("exit", (code) => process.exit(code ?? 0));
