/**
 * Vercel Build Output API v3
 * https://vercel.com/docs/build-output-api/v3
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

// 1. Clean
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(stat,  { recursive: true });
mkdirSync(fnDir, { recursive: true });

// 2. Frontend → static/
cpSync(resolve(root, "artifacts/reviewbot/dist"), stat, { recursive: true });
console.log("✓ Frontend copied to .vercel/output/static/");

// 3. Bundle Express API — use array form to avoid ALL shell quoting issues
console.log("Bundling Express API...");
const outFile = resolve(fnDir, "index.mjs");

// Write a tiny ESM shim for require() — avoids the single-quote banner problem entirely
const shimPath = resolve(fnDir, "shim.mjs");
writeFileSync(shimPath, `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);\n`);

const esbuildArgs = [
  "npx", "esbuild", "src/app.ts",
  "--bundle",
  "--platform=node",
  "--target=node20",
  "--format=esm",
  `--outfile=${outFile}`,
  "--external:pg-native",
  "--external:mock-aws-s3",
  "--external:aws-sdk",
  "--external:nock",
  "--inject:" + shimPath,   // inject the shim file instead of --banner
].join(" ");

execSync(esbuildArgs, {
  stdio: "inherit",
  cwd: resolve(root, "artifacts/api-server"),
  shell: false,   // bypass shell entirely — no quoting issues
  env: { ...process.env, ESBUILD_BINARY_PATH: undefined }
});
console.log("✓ API bundled to .vercel/output/functions/api/[...path].func/index.mjs");

// 4. Function config
writeFileSync(
  resolve(fnDir, ".vc-config.json"),
  JSON.stringify({
    runtime:      "nodejs20.x",
    handler:      "index.mjs",
    launcherType: "Nodejs",
    maxDuration:  60
  }, null, 2)
);
console.log("✓ .vc-config.json written");

// 5. Route config
writeFileSync(
  resolve(out, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { src: "^/api(/.*)?$", dest: "/api/[...path]" },
      { handle: "filesystem" },
      { src: "/(.*)",        dest: "/index.html" }
    ]
  }, null, 2)
);
console.log("✓ config.json written");
console.log("\nBuild complete.");
