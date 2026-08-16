#!/usr/bin/env node
import { gzipSync } from "node:zlib";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const BLOCK_SIZE = 512;

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`campo tar excede ${length} bytes: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  if (encoded.length >= length) throw new Error(`valor tar excede campo octal: ${value}`);
  writeString(buffer, offset, length, `${encoded}\0`);
}

function splitTarPath(pathname) {
  const bytes = Buffer.byteLength(pathname);
  if (bytes <= 100) return { name: pathname, prefix: "" };
  const slashes = [...pathname.matchAll(/\//g)].map((match) => match.index).reverse();
  for (const slash of slashes) {
    const prefix = pathname.slice(0, slash);
    const name = pathname.slice(slash + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`caminho longo demais para ustar: ${pathname}`);
}

function tarHeader({ pathname, size, directory }) {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitTarPath(pathname);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, directory ? 0o755 : 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, directory ? "5" : "0");
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "root");
  writeString(header, 297, 32, "root");
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);
  writeString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, "0");
  writeString(header, 148, 8, `${encodedChecksum}\0 `);
  return header;
}

async function collectEntries(root, relative = "") {
  const directory = resolve(root, relative);
  const children = await readdir(directory);
  children.sort((left, right) => left.localeCompare(right, "en"));
  const entries = [];
  for (const child of children) {
    const childRelative = relative ? `${relative}/${child}` : child;
    const childPath = resolve(root, ...childRelative.split("/"));
    const metadata = await lstat(childPath);
    if (metadata.isSymbolicLink()) throw new Error(`link simbólico não permitido no bundle: ${childRelative}`);
    if (metadata.isDirectory()) {
      entries.push({ pathname: `${childRelative}/`, directory: true, bytes: Buffer.alloc(0) });
      entries.push(...await collectEntries(root, childRelative));
    } else if (metadata.isFile()) {
      entries.push({ pathname: childRelative, directory: false, bytes: await readFile(childPath) });
    } else {
      throw new Error(`tipo de arquivo não permitido no bundle: ${childRelative}`);
    }
  }
  return entries;
}

export async function createDeterministicTarGz({ source, archive }) {
  const resolvedSource = resolve(source);
  const entries = await collectEntries(resolvedSource);
  const chunks = [];
  for (const entry of entries) {
    const pathname = entry.pathname.split(sep).join(posix.sep);
    chunks.push(tarHeader({ pathname, size: entry.bytes.length, directory: entry.directory }));
    if (!entry.directory) {
      chunks.push(entry.bytes);
      const padding = (BLOCK_SIZE - (entry.bytes.length % BLOCK_SIZE)) % BLOCK_SIZE;
      if (padding) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  const compressed = gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
  await mkdir(dirname(resolve(archive)), { recursive: true });
  await writeFile(resolve(archive), compressed);
  return { entries: entries.map((entry) => entry.pathname), byteSize: compressed.length };
}

async function main() {
  const [source, archive] = process.argv.slice(2);
  if (!source || !archive) throw new Error("uso: deterministic-tar.mjs SOURCE_DIR ARCHIVE_PATH");
  const result = await createDeterministicTarGz({ source, archive });
  console.log(`DETERMINISTIC_TAR_CREATED: ${result.entries.length} entradas, ${result.byteSize} bytes`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`DETERMINISTIC_TAR_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
