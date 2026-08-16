#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { stringifyCsv } from "../lib/csv.mjs";
import { parseCliArgs, resolveRoot, sha256, stableJson, writeYaml } from "../lib/io.mjs";
import { readEditorialRepository } from "../lib/repository.mjs";
import { validateDataset } from "../../lib/data/schema.js";

const EMPTY_QUALITY = Object.freeze({
  firstPassCompletedAt: null,
  secondPassCompletedAt: null,
  coldReviewCompletedAt: null,
  retestCompletedAt: null,
  readingHours: null,
});

export function projectPublicDataset(dataset) {
  const publishedCandidateIds = new Set(
    dataset.candidacies
      .filter((candidate) => candidate.editorialStatus === "published" && candidate.reconciliationStatus === "reconciled")
      .map((candidate) => candidate.id),
  );

  return {
    ...dataset,
    candidacies: dataset.candidacies.map((candidate) => publishedCandidateIds.has(candidate.id)
      ? candidate
      : { ...candidate, quality: { ...EMPTY_QUALITY } }),
    findings: dataset.findings.map((finding) => publishedCandidateIds.has(finding.candidacyId)
      ? finding
      : {
          candidacyId: finding.candidacyId,
          themeId: finding.themeId,
          status: "pending",
          proposalIds: [],
          evidence: [],
          reviewedAt: null,
          note: null,
        }),
    proposals: dataset.proposals.filter((proposal) => publishedCandidateIds.has(proposal.candidacyId)),
    codingDecisions: dataset.codingDecisions.filter((decision) => publishedCandidateIds.has(decision.candidacyId)),
  };
}

export function publicFiles(dataset) {
  const candidacies = dataset.candidacies.map((candidate) => ({
    ...candidate,
    comparisonEligible: candidate.editorialStatus === "published" && candidate.reconciliationStatus === "reconciled",
  }));
  const json = (value) => stableJson(value);
  return new Map([
    ["temas.json", json(dataset.themes)],
    ["etiquetas.json", json(dataset.secondaryTags)],
    ["candidaturas.json", json(candidacies)],
    ["documentos.json", json(dataset.documents)],
    ["propostas.json", json(dataset.proposals)],
    ["cobertura.json", json(dataset.findings)],
    ["decisoes.json", json(dataset.codingDecisions)],
    ["propostas.csv", stringifyCsv(
      ["id", "candidacyId", "primaryThemeId", "secondaryTagIds", "quoteShort", "quoteFull", "canonicalOccurrenceId", "sourceDocumentSha256", "codedAt", "coldReviewedAt"],
      dataset.proposals,
    )],
    ["cobertura.csv", stringifyCsv(
      ["candidacyId", "themeId", "status", "proposalIds", "reviewedAt", "note"],
      dataset.findings,
    )],
  ]);
}

function contentDigest(dataset) {
  return sha256(stableJson({
    schemaVersion: dataset.schemaVersion,
    methodology: dataset.methodology,
    source: dataset.source,
    themes: dataset.themes,
    secondaryTags: dataset.secondaryTags,
    candidacies: dataset.candidacies,
    documents: dataset.documents,
    findings: dataset.findings,
    proposals: dataset.proposals,
    codingDecisions: dataset.codingDecisions,
  }));
}

async function existingText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertOrWrite(path, content, { check, immutable = false }) {
  const existing = await existingText(path);
  if (existing === content) return false;
  if (check) throw new Error(`artefato desatualizado: ${path}`);
  if (immutable && existing !== null) throw new Error(`snapshot imutável já existe com conteúdo diferente: ${path}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

export async function buildSnapshot({ root = process.cwd(), check = false } = {}) {
  const resolvedRoot = resolveRoot(root);
  const sourceDataset = await readEditorialRepository(resolvedRoot);
  const baseRelease = {
    ...sourceDataset.release,
    candidateIds: sourceDataset.candidacies.map((candidate) => candidate.id),
    publishedCandidateIds: sourceDataset.candidacies
      .filter((candidate) => candidate.editorialStatus === "published")
      .map((candidate) => candidate.id),
  };
  const internalDataset = validateDataset({ ...sourceDataset, release: baseRelease });
  const publicDataset = projectPublicDataset(internalDataset);
  const files = publicFiles(publicDataset);
  const integrity = [...files].map(([path, content]) => ({
    path,
    sha256: sha256(content),
    byteSize: Buffer.byteLength(content),
  }));
  const release = {
    ...baseRelease,
    contentSha256: contentDigest(publicDataset),
    files: integrity,
  };
  const dataset = validateDataset({ ...publicDataset, release });
  const manifest = stableJson({
    ...release,
    source: {
      datasetId: dataset.source.datasetId,
      datasetUrl: dataset.source.datasetUrl,
      licenseId: dataset.source.licenseId,
      observedAt: dataset.source.observedAt,
      reconciliation: dataset.source.reconciliation,
    },
    counts: {
      candidacies: dataset.candidacies.length,
      publishedCandidacies: release.publishedCandidateIds.length,
      documents: dataset.documents.length,
      proposals: dataset.proposals.length,
    },
  });
  files.set("manifest.json", manifest);

  const snapshotDirectory = join(resolvedRoot, `public/dados/snapshots/${release.id}`);
  const latestDirectory = join(resolvedRoot, "public/dados/latest");
  let changes = 0;
  for (const [path, content] of files) {
    if (await assertOrWrite(join(snapshotDirectory, path), content, { check, immutable: true })) changes += 1;
    if (await assertOrWrite(join(latestDirectory, path), content, { check })) changes += 1;
  }
  if (await assertOrWrite(join(resolvedRoot, "lib/data/generated/latest.json"), stableJson(dataset), { check })) changes += 1;
  const releaseYaml = stableJson(release);
  if (check) {
    for (const path of [
      join(resolvedRoot, "content/releases/current.yaml"),
      join(resolvedRoot, `content/releases/datasets/${release.id}.yaml`),
    ]) {
      if (await existingText(path) !== releaseYaml) throw new Error(`release desatualizado: ${path}`);
    }
  } else {
    if (await writeYaml(join(resolvedRoot, "content/releases/current.yaml"), release)) changes += 1;
    if (await writeYaml(join(resolvedRoot, `content/releases/datasets/${release.id}.yaml`), release)) changes += 1;
  }
  return { dataset, changes };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await buildSnapshot({ root: args.root, check: Boolean(args.check) });
  console.log(`${args.check ? "SNAPSHOT_CURRENT" : "SNAPSHOT_BUILT"}: ${result.dataset.release.id} (${result.changes} arquivos alterados)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`SNAPSHOT_ERROR: ${error.message}`);
  process.exitCode = 1;
});
