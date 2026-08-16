import assert from "node:assert/strict";
import test from "node:test";
import { semanticSyncSignature } from "../scripts/tse/sync-metadata.mjs";

const pdfHash = "a".repeat(64);

function fixture() {
  return {
    candidates: [{
      id: "100",
      ballotName: "CANDIDATURA TESTE",
      ballotNumber: 10,
      party: { acronym: "TST", name: "Partido Teste" },
      officialStatus: {
        code: "1",
        label: "Aguardando julgamento",
        source: "reconciled",
        observedAt: "2026-08-15T12:00:00.000Z",
      },
      officialTotalizationStatus: {
        label: "Não totalizado",
        source: "divulgacand-rest",
        observedAt: "2026-08-15T12:00:00.000Z",
      },
      reconciliationStatus: "reconciled",
      sourceIds: {
        csvCandidateId: "100",
        restCandidateId: "100",
        csvElectionCode: "6257",
        restElectionId: "20322002026",
      },
      planDocumentIds: ["doc-1"],
      observedDocumentCorpora: {
        zipSha256s: [pdfHash],
        restSha256s: [pdfHash],
      },
      sourceObservedAt: "2026-08-15T12:00:00.000Z",
      corpusObservedAt: "2026-08-15T12:00:00.000Z",
      quality: { coldReviewCompletedAt: null },
    }],
    documents: [{
      id: "doc-1",
      sha256: pdfHash,
      sources: [{ kind: "ckan_zip", archiveEntry: "BR/plano.pdf" }],
    }],
    source: {
      datasetId: "dataset-1",
      datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
      licenseId: "cc-by",
      ckanMetadataModifiedAt: "2026-08-15T12:00:00.000Z",
      observedAt: "2026-08-15T12:00:00.000Z",
      csvGeneratedAt: "2026-08-15T12:00:00.000Z",
      resources: [{
        id: "resource-1",
        name: "Candidatos",
        format: "ZIP",
        url: "https://cdn.tse.jus.br/candidatos.zip",
        sha256: "b".repeat(64),
        etag: "primeiro",
        lastModified: "2026-08-15T12:00:00.000Z",
      }],
      rest: {
        url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar",
        electionId: "20322002026",
        observedAt: "2026-08-15T12:00:00.000Z",
        candidateIds: ["100"],
        planDocuments: [{
          candidacyId: "100",
          documentId: "rest-doc-1",
          officialFilename: "plano.pdf",
          canonicalUrl: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/rest-doc-1",
          position: 0,
          sha256: pdfHash,
          byteSize: 2_048,
          lastModified: "2026-08-15T12:00:00.000Z",
        }],
      },
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

test("assinatura semântica ignora relógios, ETag e hash diário do ZIP bruto", () => {
  const original = fixture();
  const regenerated = clone(original);
  regenerated.source.ckanMetadataModifiedAt = "2026-08-16T12:00:00.000Z";
  regenerated.source.observedAt = "2026-08-16T12:00:00.000Z";
  regenerated.source.csvGeneratedAt = "2026-08-16T12:00:00.000Z";
  regenerated.source.resources[0].sha256 = "c".repeat(64);
  regenerated.source.resources[0].etag = "segundo";
  regenerated.source.resources[0].lastModified = "2026-08-16T12:00:00.000Z";
  regenerated.source.rest.observedAt = "2026-08-16T12:00:00.000Z";
  regenerated.source.rest.planDocuments[0].lastModified = "2026-08-16T12:00:00.000Z";
  regenerated.candidates[0].officialStatus.observedAt = "2026-08-16T12:00:00.000Z";
  regenerated.candidates[0].officialTotalizationStatus.observedAt = "2026-08-16T12:00:00.000Z";
  regenerated.candidates[0].sourceObservedAt = "2026-08-16T12:00:00.000Z";
  regenerated.candidates[0].corpusObservedAt = "2026-08-16T12:00:00.000Z";

  assert.equal(semanticSyncSignature(original), semanticSyncSignature(regenerated));
});

test("assinatura semântica detecta mudança eleitoral ou troca no corpus PDF", () => {
  const original = fixture();
  const renamed = clone(original);
  renamed.candidates[0].ballotName = "NOVO NOME OFICIAL";
  const newPdf = clone(original);
  newPdf.candidates[0].observedDocumentCorpora.zipSha256s = ["d".repeat(64)];
  newPdf.source.rest.planDocuments[0].sha256 = "d".repeat(64);

  assert.notEqual(semanticSyncSignature(original), semanticSyncSignature(renamed));
  assert.notEqual(semanticSyncSignature(original), semanticSyncSignature(newPdf));
});

test("migração semantic-v2 infere o corpus de registros antigos sem timestamps", () => {
  const current = fixture();
  const legacy = clone(current);
  delete legacy.candidates[0].observedDocumentCorpora;

  assert.equal(semanticSyncSignature(current), semanticSyncSignature(legacy));
});
