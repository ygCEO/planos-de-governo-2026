#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, resolveRoot, sha256, stableJson } from "../lib/io.mjs";
import { readEditorialRepository } from "../lib/repository.mjs";
import { readZipEntries } from "../lib/zip.mjs";

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function download(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await pause(750 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`falha ao baixar ${url}: ${lastError?.message ?? "erro desconhecido"}`);
}

export function validatePdfBytes(bytes, expected = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length < 8) throw new Error("PDF malformado: arquivo muito curto");
  const header = buffer.subarray(0, Math.min(buffer.length, 1_024)).toString("latin1");
  if (!/%PDF-\d\.\d/.test(header)) throw new Error("PDF malformado: assinatura %PDF ausente");
  const trailer = buffer.subarray(Math.max(0, buffer.length - 4_096)).toString("latin1");
  if (!/%%EOF[\s\0]*$/.test(trailer)) throw new Error("PDF malformado: marcador %%EOF final ausente");
  if (expected.byteSize !== undefined && buffer.length !== expected.byteSize) {
    throw new Error(`PDF truncado ou divergente: esperado ${expected.byteSize} bytes, recebido ${buffer.length}`);
  }
  const digest = sha256(buffer);
  if (expected.sha256 && digest !== expected.sha256) {
    throw new Error(`SHA-256 divergente: esperado ${expected.sha256}, recebido ${digest}`);
  }
  return { sha256: digest, byteSize: buffer.length };
}

async function writeImmutable(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx" });
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(path);
    if (sha256(existing) !== sha256(bytes) || existing.length !== bytes.length) {
      throw new Error(`objeto imutável já existe com conteúdo diferente: ${path}`);
    }
    return false;
  }
}

async function loadDocumentBytes(document, archiveCache, localArchive) {
  const zipSource = document.sources.find((source) => source.kind === "ckan_zip" && source.archiveEntry);
  if (zipSource) {
    if (!archiveCache.has(zipSource.url)) {
      const bytes = localArchive
        ? await readFile(localArchive)
        : process.env.TSE_PROPOSALS_ARCHIVE
          ? await readFile(process.env.TSE_PROPOSALS_ARCHIVE)
          : await download(zipSource.url);
      archiveCache.set(zipSource.url, new Map(readZipEntries(bytes).map((entry) => [entry.name, entry.data])));
    }
    const bytes = archiveCache.get(zipSource.url).get(zipSource.archiveEntry);
    if (!bytes) throw new Error(`entrada ${zipSource.archiveEntry} não encontrada em ${zipSource.url}`);
    return bytes;
  }
  const directSource = document.sources.find((source) => source.kind === "divulgacand_rest");
  if (!directSource) throw new Error(`documento ${document.id} não tem fonte recuperável`);
  return download(directSource.url);
}

function manifestFor(dataset, stagingDirectory) {
  return {
    version: 1,
    snapshotId: dataset.release.id,
    generatedAt: dataset.release.createdAt,
    bucketLayout: "content-addressed",
    objects: dataset.documents.map((document) => ({
      documentId: document.id,
      candidacyId: document.candidacyId,
      objectKey: document.preservedObjectKey,
      localPath: relative(stagingDirectory, join(stagingDirectory, document.preservedObjectKey)).replaceAll("\\", "/"),
      sha256: document.sha256,
      byteSize: document.byteSize,
      contentType: document.mimeType,
      uploadStatus: "ready",
      requiresVisualPageVerification: !document.pageCountVerified,
    })),
  };
}

async function checkStaging(dataset, stagingDirectory, manifestPath) {
  const expectedManifest = stableJson(manifestFor(dataset, stagingDirectory));
  let actualManifest;
  try {
    actualManifest = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`manifesto de upload ausente: ${manifestPath}`);
    throw error;
  }
  if (actualManifest !== expectedManifest) throw new Error(`manifesto de upload desatualizado: ${manifestPath}`);
  for (const document of dataset.documents) {
    const path = join(stagingDirectory, document.preservedObjectKey);
    const bytes = await readFile(path).catch((error) => {
      if (error.code === "ENOENT") throw new Error(`objeto de staging ausente: ${path}`);
      throw error;
    });
    validatePdfBytes(bytes, document);
  }
  return { checked: dataset.documents.length, written: 0, manifestPath };
}

export async function stagePdfs({
  root = process.cwd(),
  stagingDir = null,
  manifest = null,
  archive = null,
  dryRun = false,
  check = false,
} = {}) {
  const resolvedRoot = resolveRoot(root);
  const stagingDirectory = resolve(stagingDir ?? join(resolvedRoot, ".wrangler/r2-staging"));
  const manifestPath = resolve(manifest ?? join(stagingDirectory, "upload-manifest.json"));
  const dataset = await readEditorialRepository(resolvedRoot);
  if (check) return checkStaging(dataset, stagingDirectory, manifestPath);

  const archiveCache = new Map();
  let written = 0;
  for (const document of dataset.documents) {
    const bytes = await loadDocumentBytes(document, archiveCache, archive);
    validatePdfBytes(bytes, document);
    if (!dryRun && await writeImmutable(join(stagingDirectory, document.preservedObjectKey), bytes)) written += 1;
  }
  if (!dryRun) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, stableJson(manifestFor(dataset, stagingDirectory)), "utf8");
  }
  return {
    checked: dataset.documents.length,
    written,
    dryRun,
    manifestPath,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.check && args.dryRun) throw new Error("use apenas uma das opções --check ou --dry-run");
  const result = await stagePdfs({
    root: args.root,
    stagingDir: args.stagingDir,
    manifest: args.manifest,
    archive: args.archive,
    dryRun: Boolean(args.dryRun),
    check: Boolean(args.check),
  });
  const label = args.check ? "PDF_STAGING_VALID" : args.dryRun ? "PDF_STAGING_DRY_RUN" : "PDF_STAGING_READY";
  console.log(`${label}: ${result.checked} PDFs verificados, ${result.written} gravados; manifesto ${result.manifestPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`PDF_STAGING_ERROR: ${error.message}`);
  process.exitCode = 1;
});
