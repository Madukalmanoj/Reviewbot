/**
 * Vercel Build Output API v3
 * https://vercel.com/docs/build-output-api/v3
 *
 * Produces .vercel/output/ that Vercel reads directly:
 *   static/                        ← React frontend (CDN)
 *   functions/api/[...path].func/  ← Express API (serverless)
 *   config.json                    ← Routing rules
 */
import { cpSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root  = fileURLToPath(new URL(".", import.meta.url));
const out   = resolve(root, ".vercel/output");
const stat  = resolve(out, "static");
const fnDir = resolve(out, "functions/api/[...path].func");

console.log("root:", root);
console.log("out :", out);

// ── 1. Clean ──────────────────────────────────────────────────────────────
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(stat,  { recursive: true });
mkdirSync(fnDir, { recursive: true });

// ── 2. Frontend → static/ ────────────────────────────────────────────────
cpSync(resolve(root, "artifacts/reviewbot/dist"), stat, { recursive: true });
console.log("✓ Frontend copied to .vercel/output/static/");

// ── 3. Bundle Express API ─────────────────────────────────────────────────
// Run esbuild from the api-server package so its local node_modules are used
console.log("Bundling Express API...");
const outFile = resolve(fnDir, "index.mjs");
execSync(
  [
    "npx esbuild src/app.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=esm",
    `--outfile=${outFile}`,
    "--external:pg-native",
    "--external:mock-aws-s3",
    "--external:aws-sdk",
    "--external:nock",
    // Fix ESM/CJS interop for pino worker threads
    "--banner:js=import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  ].join(" "),
  {
    stdio: "inherit",
    cwd: resolve(root, "artifacts/api-server")  // run from api-server so npx finds its esbuild
  }
);
console.log("✓ API bundled to .vercel/output/functions/api/[...path].func/index.mjs");

// ── 4. Function config ────────────────────────────────────────────────────
writeFileSync(
  resolve(fnDir, ".vc-config.json"),
  JSON.stringify({
    runtime:   "nodejs20.x",
    handler:   "index.mjs",
    launcherType: "Nodejs",
    maxDuration: 60
  }, null, 2)
);
console.log("✓ .vc-config.json written");

// ── 5. Route config ───────────────────────────────────────────────────────
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
