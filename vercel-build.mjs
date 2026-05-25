/**
 * Vercel Build Output API v3
 * https://vercel.com/docs/build-output-api/v3
 *
 * Produces .vercel/output/ that Vercel reads directly:
 *   static/                        ← React frontend (CDN)
 *   functions/api/[...path].func/  ← Express API (serverless)
 *   config.json                    ← Routing rules
 */
import { cpSync, rmSync, existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root  = fileURLToPath(new URL(".", import.meta.url));
const out   = resolve(root, ".vercel/output");
const staticDir = resolve(out, "static");
const fnDir = resolve(out, "functions/api/[...path].func");

console.log("root:", root);
console.log("out :", out);

// ── 1. Clean ──────────────────────────────────────────────────────────────
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(staticDir, { recursive: true });
mkdirSync(fnDir, { recursive: true });

// ── 2. Frontend → static/ ────────────────────────────────────────────────
cpSync(resolve(root, "artifacts/reviewbot/dist"), staticDir, { recursive: true });
console.log("✓ Frontend copied to .vercel/output/static/");

// ── 3. Build Express API (produces dist/index.mjs and dist/serverless.mjs) ─
console.log("Bundling Express API...");
execSync("pnpm --filter @workspace/api-server run build", {
  stdio: "inherit",
  cwd: root,
});
console.log("✓ API bundled");

// ── 4. Copy serverless bundle + pino worker files into function directory ─
const apiDistDir = resolve(root, "artifacts/api-server/dist");

// Copy all files from dist/ EXCEPT index.mjs (that's the dev server with app.listen)
// The handler is serverless.mjs
function copyDirExcept(src, dest, exclude) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirExcept(srcPath, destPath, []);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copyDirExcept(apiDistDir, fnDir, ["index.mjs", "index.mjs.map"]);
console.log("✓ Serverless bundle copied to .vercel/output/functions/api/[...path].func/");

// ── 5. Function config ────────────────────────────────────────────────────
writeFileSync(
  resolve(fnDir, ".vc-config.json"),
  JSON.stringify({
    runtime:      "nodejs20.x",
    handler:      "serverless.mjs",
    launcherType: "Nodejs",
    maxDuration:  60
  }, null, 2)
);
console.log("✓ .vc-config.json written");

// ── 6. Route config ───────────────────────────────────────────────────────
writeFileSync(
  resolve(out, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { src: "^/api(/.*)?$",  dest: "/api/[...path]" },
      { handle: "filesystem" },
      { src: "/(.*)",          dest: "/index.html" }
    ]
  }, null, 2)
);
console.log("✓ config.json written");
console.log("\nBuild complete.");
