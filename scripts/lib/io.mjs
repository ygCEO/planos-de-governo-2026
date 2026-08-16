import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
}

export async function readYaml(path) {
  const text = await readFile(path, "utf8");
  try {
    // JSON is a normative subset of YAML 1.2. Restricting the editorial files
    // to this subset keeps builds deterministic without a runtime dependency.
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: YAML deve usar o subconjunto JSON compatível com YAML 1.2 (${error.message})`);
  }
}

export async function writeYaml(path, value) {
  return writeIfChanged(path, stableJson(value));
}

export async function writeIfChanged(path, content) {
  let previous = null;
  try {
    previous = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous === content) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

export async function listFiles(path, suffix = null) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath, suffix));
    else if (!suffix || entry.name.endsWith(suffix)) files.push(entryPath);
  }
  return files.sort();
}

export async function fileIntegrity(path, basePath) {
  const bytes = await readFile(path);
  const metadata = await stat(path);
  return {
    path: relative(basePath, path).replaceAll("\\", "/"),
    sha256: sha256(bytes),
    byteSize: metadata.size,
  };
}

export function resolveRoot(cliRoot = null) {
  return resolve(cliRoot ?? process.cwd());
}

export function parseCliArgs(argv) {
  const parsed = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      parsed.positional.push(argument);
      continue;
    }
    const [rawKey, inline] = argument.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inline !== undefined) parsed[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) parsed[key] = argv[++index];
    else parsed[key] = true;
  }
  return parsed;
}
