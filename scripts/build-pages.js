import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR, PUBLIC_DIR, ROOT_DIR } from "../src/paths.js";

const outDir = join(ROOT_DIR, "dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(PUBLIC_DIR, outDir, { recursive: true });
await mkdir(join(outDir, "data"), { recursive: true });
await cp(join(DATA_DIR, "sports.snapshot.json"), join(outDir, "data", "sports.snapshot.json"));

console.log(`Built GitHub Pages artifact at ${outDir}`);
