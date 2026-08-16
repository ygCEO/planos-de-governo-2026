#!/usr/bin/env node
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const parsed = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      parsed.positional.push(argument);
      continue;
    }
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) parsed[key] = true;
    else parsed[key] = argv[++index];
  }
  return parsed;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function createSitesHandoff({ root, tag, commit, archive }) {
  const resolvedRoot = resolve(root);
  const match = /^dados-(\d{4}-\d{2}-\d{2}\.\d+)$/.exec(tag);
  assert(match, `tag de dados inválida: ${tag}`);
  assert(/^[a-f0-9]{40}$/.test(commit), "commit deve ser SHA Git completo");
  const manifestPath = join(resolvedRoot, "public/dados/latest/manifest.json");
  const methodologyPath = join(resolvedRoot, "content/releases/metodologia.yaml");
  const [manifestBytes, methodology, archiveBytes] = await Promise.all([
    readFile(manifestPath),
    readJson(methodologyPath),
    readFile(archive),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert(manifest.id === match[1], `manifesto ${manifest.id} diverge de ${tag}`);
  assert(methodology.status === "frozen", "metodologia não está congelada");
  assert(/^[a-f0-9]{40}$/.test(methodology.commit), "commit metodológico inválido");
  return {
    schemaVersion: "1.0",
    provider: "sites",
    tag,
    commit,
    snapshotId: manifest.id,
    methodologyTag: `metodologia-v${methodology.version}`,
    methodologyCommit: methodology.commit,
    manifestPath: "public/dados/latest/manifest.json",
    manifestSha256: sha256(manifestBytes),
    archive: basename(archive),
    archiveSha256: sha256(archiveBytes),
  };
}

export async function verifySitesHandoff({ root, handoff, expectedCommit = null }) {
  const resolvedRoot = resolve(root);
  const record = typeof handoff === "string" ? await readJson(handoff) : handoff;
  assert(record.schemaVersion === "1.0", "versão do handoff inválida");
  assert(record.provider === "sites", "provedor do handoff deve ser sites");
  assert(/^dados-(\d{4}-\d{2}-\d{2}\.\d+)$/.test(record.tag), "tag do handoff inválida");
  assert(/^[a-f0-9]{40}$/.test(record.commit), "commit do handoff inválido");
  if (expectedCommit) assert(record.commit === expectedCommit, "handoff não aponta para o commit esperado");
  assert(record.tag === `dados-${record.snapshotId}`, "tag e snapshot do handoff divergem");
  assert(record.manifestPath === "public/dados/latest/manifest.json", "caminho do manifesto não é canônico");
  assert(record.archive === basename(record.archive), "nome do bundle contém caminho");

  const manifestPath = join(resolvedRoot, record.manifestPath);
  const archivePath = join(resolvedRoot, record.archive);
  const methodologyPath = join(resolvedRoot, "content/releases/metodologia.yaml");
  const [manifestBytes, archiveBytes, methodology] = await Promise.all([
    readFile(manifestPath),
    readFile(archivePath),
    readJson(methodologyPath),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert(manifest.id === record.snapshotId, "snapshot público diverge do handoff");
  assert(sha256(manifestBytes) === record.manifestSha256, "hash do manifesto diverge do handoff");
  assert(sha256(archiveBytes) === record.archiveSha256, "hash do bundle diverge do handoff");
  assert(record.methodologyTag === `metodologia-v${methodology.version}`, "tag metodológica diverge do conteúdo");
  assert(record.methodologyCommit === methodology.commit, "commit metodológico diverge do conteúdo");
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];
  if (command === "create") {
    const handoff = await createSitesHandoff({
      root: args.root ?? process.cwd(),
      tag: args.tag,
      commit: args.commit,
      archive: resolve(args.archive),
    });
    process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const handoff = await verifySitesHandoff({
      root: args.root ?? process.cwd(),
      handoff: resolve(args.handoff),
      expectedCommit: args.expectedCommit ?? null,
    });
    console.log(`SITES_HANDOFF_VALID: ${handoff.tag} @ ${handoff.commit}`);
    return;
  }
  throw new Error(`comando inválido: ${command ?? "ausente"}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`SITES_HANDOFF_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
