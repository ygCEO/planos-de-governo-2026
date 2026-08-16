#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, resolveRoot } from "../lib/io.mjs";

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("a origem de upload deve usar HTTPS");
  }
  return url.origin;
}

export async function uploadPdfs({
  root = process.cwd(),
  manifest = null,
  origin = process.env.PDF_UPLOAD_ORIGIN,
  token = process.env.PDF_UPLOAD_TOKEN,
} = {}) {
  if (!origin) throw new Error("PDF_UPLOAD_ORIGIN ou --origin é obrigatório");
  if (!token) throw new Error("PDF_UPLOAD_TOKEN é obrigatório");
  const resolvedRoot = resolveRoot(root);
  const stagingDirectory = join(resolvedRoot, ".wrangler/r2-staging");
  const manifestPath = resolve(manifest ?? join(stagingDirectory, "upload-manifest.json"));
  const uploadManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let uploaded = 0;
  let alreadyPreserved = 0;

  for (const object of uploadManifest.objects ?? []) {
    const bytes = await readFile(join(stagingDirectory, object.localPath));
    const endpoint = `${normalizedOrigin(origin)}/api/internal/pdfs/${object.sha256}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": object.contentType,
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`falha ao preservar ${object.documentId}: HTTP ${response.status} ${result.error ?? ""}`.trim());
    if (result.sha256 !== object.sha256 || result.byteSize !== object.byteSize || result.objectKey !== object.objectKey) {
      throw new Error(`resposta remota divergente para ${object.documentId}`);
    }
    if (result.status === "already_preserved") alreadyPreserved += 1;
    else uploaded += 1;
  }

  return { checked: uploadManifest.objects?.length ?? 0, uploaded, alreadyPreserved };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await uploadPdfs({ root: args.root, manifest: args.manifest, origin: args.origin });
  console.log(`PDF_UPLOAD_COMPLETE: ${result.checked} verificados; ${result.uploaded} enviados; ${result.alreadyPreserved} já existiam`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`PDF_UPLOAD_ERROR: ${error.message}`);
  process.exitCode = 1;
});
