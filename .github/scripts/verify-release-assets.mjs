#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifySitesHandoff } from "./sites-handoff.mjs";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--") || !argv[index + 1]) throw new Error(`argumento inválido: ${argument}`);
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = argv[++index];
  }
  return parsed;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifyReleaseAssets({ root, archive, checksum, handoff, expectedCommit }) {
  const archivePath = resolve(archive);
  const checksumText = await readFile(resolve(checksum), "utf8");
  const checksumMatch = /^([a-f0-9]{64}) {2}([^\r\n]+)\r?\n?$/.exec(checksumText);
  assert(checksumMatch, "arquivo de checksum da release é inválido");
  assert(checksumMatch[2] === basename(archivePath), "checksum aponta para nome de bundle inesperado");
  const archiveHash = sha256(await readFile(archivePath));
  assert(archiveHash === checksumMatch[1], "checksum publicado diverge do bundle da release");

  const record = await verifySitesHandoff({ root, handoff, expectedCommit });
  assert(record.archive === basename(archivePath), "handoff aponta para bundle inesperado");
  assert(record.archiveSha256 === archiveHash, "handoff e checksum da release divergem");
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const record = await verifyReleaseAssets({
    root: args.root ?? process.cwd(),
    archive: args.archive,
    checksum: args.checksum,
    handoff: args.handoff,
    expectedCommit: args.expectedCommit,
  });
  console.log(`RELEASE_ASSETS_VALID: ${record.tag} @ ${record.commit}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`RELEASE_ASSETS_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
