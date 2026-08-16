#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { listFiles, parseCliArgs, readYaml, resolveRoot, writeYaml } from "../lib/io.mjs";
import { readEditorialRepository } from "../lib/repository.mjs";
import { validatePdfBytes } from "./stage-pdfs.mjs";
import { isAllowedPreservedPublicUrl } from "../../lib/data/schema.js";

function joinUrl(base, suffix) {
  return `${base.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}

async function fetchVerifiedPdf(url, expected) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`verificação remota falhou para ${url}: HTTP ${response.status}`);
    return validatePdfBytes(Buffer.from(await response.arrayBuffer()), expected);
  } finally {
    clearTimeout(timeout);
  }
}

async function nextReleaseId(root, instant) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const releases = await listFiles(join(root, "content/releases/datasets"), ".yaml");
  const ids = (await Promise.all(releases.map(readYaml))).map((release) => release.id);
  const prefix = `${date}.`;
  const sequences = ids.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length))).filter(Number.isInteger);
  return `${prefix}${Math.max(0, ...sequences) + 1}`;
}

export async function markPdfsPreserved({
  root = process.cwd(),
  manifest = null,
  baseUrl,
  origin = null,
  dryRun = false,
  check = false,
} = {}) {
  if (!baseUrl) throw new Error("--base-url é obrigatório (ex.: /arquivos)");
  const resolvedRoot = resolveRoot(root);
  const manifestPath = resolve(manifest ?? join(resolvedRoot, ".wrangler/r2-staging/upload-manifest.json"));
  const uploadManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const dataset = await readEditorialRepository(resolvedRoot);
  if (uploadManifest.snapshotId !== dataset.release.id) {
    throw new Error(`manifesto pertence ao snapshot ${uploadManifest.snapshotId}, mas o atual é ${dataset.release.id}`);
  }
  const manifestObjects = new Map((uploadManifest.objects ?? []).map((object) => [object.documentId, object]));
  const verified = [];
  for (const document of dataset.documents) {
    const object = manifestObjects.get(document.id);
    if (!object) throw new Error(`documento ${document.id} ausente do manifesto de upload`);
    if (object.sha256 !== document.sha256 || object.byteSize !== document.byteSize || object.objectKey !== document.preservedObjectKey) {
      throw new Error(`objeto ${document.id} diverge dos metadados editoriais`);
    }
    const publicUrl = joinUrl(baseUrl, document.sha256);
    if (!isAllowedPreservedPublicUrl(publicUrl, document.sha256)) {
      throw new Error(`URL pública fora da allowlist para ${document.id}: use /arquivos ou uma origem HTTPS permitida`);
    }
    const verificationUrl = /^https:\/\//.test(publicUrl)
      ? publicUrl
      : origin
        ? joinUrl(origin, publicUrl)
        : null;
    if (verificationUrl) {
      await fetchVerifiedPdf(verificationUrl, document);
    } else if (object.uploadStatus !== "verified" || object.remoteSha256 !== document.sha256) {
      throw new Error(`objeto ${document.id} não tem prova de upload; informe --origin ou manifesto com uploadStatus=verified e remoteSha256`);
    }
    verified.push({ document, publicUrl });
  }

  const changes = verified.filter(({ document, publicUrl }) => document.preservationStatus !== "preserved" || document.preservedPublicUrl !== publicUrl);
  if (check) {
    if (changes.length) throw new Error(`${changes.length} documentos verificados ainda não estão marcados como preservados`);
    return { verified: verified.length, changed: 0, written: false };
  }
  if (dryRun || changes.length === 0) return { verified: verified.length, changed: changes.length, written: false };

  const changedById = new Map(changes.map((item) => [item.document.id, item.publicUrl]));
  for (const document of dataset.documents) {
    const publicUrl = changedById.get(document.id);
    if (!publicUrl) continue;
    await writeYaml(join(resolvedRoot, `content/documentos/${document.id}.yaml`), {
      ...document,
      preservationStatus: "preserved",
      preservedPublicUrl: publicUrl,
    });
  }
  const createdAt = new Date().toISOString();
  const release = {
    ...dataset.release,
    id: await nextReleaseId(resolvedRoot, createdAt),
    createdAt,
    contentSha256: "pending",
    files: [],
  };
  await writeYaml(join(resolvedRoot, `content/releases/datasets/${release.id}.yaml`), release);
  await writeYaml(join(resolvedRoot, "content/releases/current.yaml"), release);
  return { verified: verified.length, changed: changes.length, written: true, snapshotId: release.id };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.check && args.dryRun) throw new Error("use apenas uma das opções --check ou --dry-run");
  const result = await markPdfsPreserved({
    root: args.root,
    manifest: args.manifest,
    baseUrl: args.baseUrl,
    origin: args.origin,
    dryRun: Boolean(args.dryRun),
    check: Boolean(args.check),
  });
  const label = args.check ? "PDF_PRESERVATION_VALID" : args.dryRun ? "PDF_PRESERVATION_DRY_RUN" : "PDF_PRESERVATION_MARKED";
  console.log(`${label}: ${result.verified} objetos verificados, ${result.changed} alterações${result.snapshotId ? `; novo snapshot ${result.snapshotId}` : ""}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`PDF_PRESERVATION_ERROR: ${error.message}`);
  process.exitCode = 1;
});
