const fs = require("node:fs");

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  if (fs.existsSync(lockfile)) {
    fs.rmSync(lockfile, { force: true });
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";
const execPath = process.env.npm_execpath ?? "";

if (!userAgent.startsWith("pnpm/") && !execPath.includes("pnpm")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
