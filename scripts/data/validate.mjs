#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { listFiles, parseCliArgs, readYaml, resolveRoot, sha256, stableJson } from "../lib/io.mjs";
import { readEditorialRepository } from "../lib/repository.mjs";

function safeSnapshotPath(value) {
  return typeof value === "string"
    && value !== ""
    && !isAbsolute(value)
    && !value.includes("\\")
    && !value.split("/").includes("..")
    && !value.split("/").includes("");
}

export async function validatePublicSnapshotIntegrity(root) {
  const snapshotsRoot = join(root, "public/dados/snapshots");
  const manifestPaths = (await listFiles(snapshotsRoot, "manifest.json"))
    .filter((path) => basename(path) === "manifest.json");
  for (const manifestPath of manifestPaths) {
    const snapshotDirectory = dirname(manifestPath);
    const snapshotId = basename(snapshotDirectory);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.id !== snapshotId) throw new Error(`${manifestPath}: id não coincide com o diretório do snapshot`);
    const releasePath = join(root, `content/releases/datasets/${snapshotId}.yaml`);
    const release = await readYaml(releasePath);
    for (const key of ["id", "schemaVersion", "methodologyVersion", "createdAt", "sourceObservedAt", "candidateIds", "publishedCandidateIds", "sourceStatus", "contentSha256", "files"]) {
      if (stableJson(manifest[key]) !== stableJson(release[key])) throw new Error(`${manifestPath}: ${key} diverge do release editorial`);
    }
    const expectedPaths = new Set(["manifest.json"]);
    for (const file of manifest.files ?? []) {
      if (!safeSnapshotPath(file.path)) throw new Error(`${manifestPath}: caminho inseguro ${String(file.path)}`);
      if (expectedPaths.has(file.path)) throw new Error(`${manifestPath}: arquivo repetido ${file.path}`);
      expectedPaths.add(file.path);
      const filePath = join(snapshotDirectory, file.path);
      const [bytes, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
      if (metadata.size !== file.byteSize) throw new Error(`${filePath}: tamanho diverge do manifesto`);
      if (sha256(bytes) !== file.sha256) throw new Error(`${filePath}: SHA-256 diverge do manifesto`);
    }
    const actualPaths = new Set((await listFiles(snapshotDirectory)).map((path) => relative(snapshotDirectory, path).replaceAll("\\", "/")));
    if (actualPaths.size !== expectedPaths.size || [...actualPaths].some((path) => !expectedPaths.has(path))) {
      throw new Error(`${snapshotDirectory}: conjunto de arquivos diverge do manifesto`);
    }
  }
  return { snapshots: manifestPaths.length };
}

export async function validateRepository({ root = process.cwd() } = {}) {
  const resolvedRoot = resolveRoot(root);
  const dataset = await readEditorialRepository(resolvedRoot);
  const publicIntegrity = await validatePublicSnapshotIntegrity(resolvedRoot);
  return {
    dataset,
    summary: {
      snapshot: dataset.release.id,
      candidacies: dataset.candidacies.length,
      documents: dataset.documents.length,
      proposals: dataset.proposals.length,
      findings: dataset.findings.length,
      publicSnapshots: publicIntegrity.snapshots,
    },
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await validateRepository({ root: args.root });
  console.log(`DATA_VALID: ${result.summary.candidacies} candidaturas, ${result.summary.documents} documentos, ${result.summary.findings} coberturas, ${result.summary.proposals} propostas; snapshot ${result.summary.snapshot}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`DATA_INVALID: ${error.message}`);
  process.exitCode = 1;
});
