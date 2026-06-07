import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const ROOT_DIR = root;
export const DATA_DIR = join(root, "data");
export const SEED_PATH = join(DATA_DIR, "sports.seed.json");
export const SNAPSHOT_PATH = join(DATA_DIR, "sports.snapshot.json");
export const PUBLIC_DIR = join(root, "public");
