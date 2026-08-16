import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePdfBytes } from "../scripts/tse/stage-pdfs.mjs";
import { uploadPdfs } from "../scripts/tse/upload-pdfs.mjs";

const validPdf = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n",
  "latin1",
);
const validSha = createHash("sha256").update(validPdf).digest("hex");

test("valida envelope, tamanho e SHA-256 antes de preparar um PDF", () => {
  assert.deepEqual(validatePdfBytes(validPdf, {
    byteSize: validPdf.length,
    sha256: validSha,
  }), {
    byteSize: validPdf.length,
    sha256: validSha,
  });

  assert.throws(() => validatePdfBytes(Buffer.from("curto")), /arquivo muito curto/);
  assert.throws(
    () => validatePdfBytes(Buffer.from("conteúdo longo sem assinatura nem fim")),
    /assinatura %PDF ausente/,
  );
  assert.throws(
    () => validatePdfBytes(Buffer.from("%PDF-1.7\nsem marcador final suficiente")),
    /marcador %%EOF final ausente/,
  );
  assert.throws(
    () => validatePdfBytes(validPdf, { byteSize: validPdf.length + 1 }),
    /PDF truncado ou divergente/,
  );
  assert.throws(
    () => validatePdfBytes(validPdf, { sha256: "0".repeat(64) }),
    /SHA-256 divergente/,
  );
});

test("cliente envia ao endpoint interno autenticado e confere a resposta", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-pdf-upload-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const staging = path.join(temporaryRoot, ".wrangler", "r2-staging");
  const localPath = `pdf/${validSha}.pdf`;
  await mkdir(path.join(staging, "pdf"), { recursive: true });
  await writeFile(path.join(staging, localPath), validPdf);
  const manifestPath = path.join(staging, "upload-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    snapshotId: "2026-08-15.1",
    objects: [{
      documentId: "doc-1",
      objectKey: localPath,
      localPath,
      sha256: validSha,
      byteSize: validPdf.length,
      contentType: "application/pdf",
    }],
  }));

  let received = null;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      method: request.method,
      path: request.url,
      bytes: Buffer.concat(chunks),
    };
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({
      sha256: validSha,
      byteSize: validPdf.length,
      objectKey: localPath,
      status: "preserved",
    }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const result = await uploadPdfs({
    root: temporaryRoot,
    manifest: manifestPath,
    origin: `http://127.0.0.1:${address.port}`,
    token: "segredo-de-teste",
  });

  assert.deepEqual(result, { checked: 1, uploaded: 1, alreadyPreserved: 0 });
  assert.equal(received.authorization, "Bearer segredo-de-teste");
  assert.equal(received.contentType, "application/pdf");
  assert.equal(received.method, "POST");
  assert.equal(received.path, `/api/internal/pdfs/${validSha}`);
  assert.deepEqual(received.bytes, validPdf);
});
