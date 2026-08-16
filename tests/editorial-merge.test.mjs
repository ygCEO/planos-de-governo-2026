import assert from "node:assert/strict";
import test from "node:test";
import { mergeEditorialMetadata } from "../scripts/lib/editorial-merge.mjs";

const themes = [
  { id: "saude" },
  { id: "educacao" },
];

function candidate(overrides = {}) {
  return {
    id: "100",
    sqCandidate: "100",
    electionYear: 2026,
    ballotName: "Candidatura Existente",
    ballotNumber: 10,
    party: { acronym: "ABC", name: "Partido ABC" },
    office: "presidente",
    jurisdiction: "BR",
    officialStatus: {
      code: "12",
      label: "Apto",
      source: "reconciled",
      observedAt: "2026-08-15T12:00:00.000Z",
    },
    editorialStatus: "published",
    reconciliationStatus: "reconciled",
    sourceIds: {
      csvCandidateId: "100",
      restCandidateId: "100",
      csvElectionCode: "1",
      restElectionId: "2026",
    },
    planDocumentIds: ["doc-old"],
    observedDocumentSha256s: ["a".repeat(64)],
    sourceObservedAt: "2026-08-15T12:00:00.000Z",
    quality: {
      firstPassCompletedAt: "2026-08-10T09:00:00.000Z",
      secondPassCompletedAt: "2026-08-10T14:00:00.000Z",
      coldReviewCompletedAt: "2026-08-12T15:00:00.000Z",
      retestCompletedAt: null,
      readingHours: 5,
    },
    ...overrides,
  };
}

function document(id, hash, overrides = {}) {
  return {
    id,
    candidacyId: "100",
    officialFilename: `${id}.pdf`,
    mimeType: "application/pdf",
    canonicalUrl: `https://example.test/${id}.pdf`,
    capturedAt: "2026-08-15T12:00:00.000Z",
    sha256: hash,
    byteSize: 1_024,
    pageCount: 10,
    pageCountVerified: true,
    preservedObjectKey: `pdf/${hash}.pdf`,
    preservedPublicUrl: `https://example.test/arquivos/${hash}`,
    preservationStatus: "preserved",
    supersedesDocumentId: null,
    sources: [
      {
        kind: "ckan_zip",
        url: "https://example.test/propostas.zip",
        resourceId: "resource-1",
        documentId: null,
        archiveEntry: `BR/${id}.pdf`,
        observedAt: "2026-08-15T12:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

const reviewedFinding = {
  candidacyId: "100",
  themeId: "saude",
  status: "proposals",
  proposalIds: ["prop-100-saude-1"],
  evidence: [],
  reviewedAt: "2026-08-12T15:00:00.000Z",
  note: null,
};

const closedFinding = {
  candidacyId: "100",
  themeId: "educacao",
  status: "not_found",
  proposalIds: [],
  evidence: [],
  reviewedAt: "2026-08-12T15:00:00.000Z",
  note: "Não foi identificada menção após leitura integral.",
};

const proposal = {
  id: "prop-100-saude-1",
  candidacyId: "100",
  primaryThemeId: "saude",
};

test("sincronização idempotente preserva trabalho editorial e metadados do PDF", () => {
  const originalCandidate = candidate();
  const originalDocument = document("doc-old", "a".repeat(64));
  const observedCandidate = candidate({
    editorialStatus: "pending",
    quality: {
      firstPassCompletedAt: null,
      secondPassCompletedAt: null,
      coldReviewCompletedAt: null,
      retestCompletedAt: null,
      readingHours: null,
    },
    sourceObservedAt: "2026-08-16T12:00:00.000Z",
  });
  const observedDocument = document("doc-old", "a".repeat(64), {
    pageCount: null,
    pageCountVerified: false,
    preservedPublicUrl: null,
    preservationStatus: "pending_upload",
  });

  const merged = mergeEditorialMetadata({
    observedCandidates: [observedCandidate],
    observedDocuments: [observedDocument],
    existingCandidates: [originalCandidate],
    existingDocuments: [originalDocument],
    existingFindings: [reviewedFinding, closedFinding],
    existingProposals: [proposal],
    themes,
  });

  assert.equal(merged.candidates[0].editorialStatus, "published");
  assert.deepEqual(merged.candidates[0].quality, originalCandidate.quality);
  assert.deepEqual(merged.findings, [reviewedFinding, closedFinding]);
  assert.deepEqual(merged.proposals, [proposal]);
  assert.equal(merged.documents[0].pageCountVerified, true);
  assert.equal(merged.documents[0].preservationStatus, "preserved");
  assert.equal(merged.documents[0].preservedPublicUrl, originalDocument.preservedPublicUrl);
  assert.deepEqual(merged.sourceChangedCandidateIds, []);
});

test("troca de corpus bloqueia publicação sem apagar documento, cobertura ou proposta", () => {
  const oldHash = "a".repeat(64);
  const newHash = "b".repeat(64);
  const observedExisting = candidate({
    ballotName: "Nome Oficial Atualizado",
    editorialStatus: "pending",
    planDocumentIds: ["doc-new"],
    observedDocumentSha256s: [newHash],
    quality: {
      firstPassCompletedAt: null,
      secondPassCompletedAt: null,
      coldReviewCompletedAt: null,
      retestCompletedAt: null,
      readingHours: null,
    },
  });
  const newCandidate = candidate({
    id: "200",
    sqCandidate: "200",
    ballotName: "Nova Candidatura",
    ballotNumber: 20,
    editorialStatus: "pending",
    planDocumentIds: [],
    observedDocumentSha256s: [],
  });

  const merged = mergeEditorialMetadata({
    observedCandidates: [observedExisting, newCandidate],
    observedDocuments: [document("doc-new", newHash)],
    existingCandidates: [candidate()],
    existingDocuments: [document("doc-old", oldHash)],
    existingFindings: [reviewedFinding, closedFinding],
    existingProposals: [proposal],
    themes,
  });

  const existing = merged.candidates.find(({ id }) => id === "100");
  const added = merged.candidates.find(({ id }) => id === "200");
  assert.equal(existing.ballotName, "Nome Oficial Atualizado");
  assert.equal(existing.editorialStatus, "source_changed");
  assert.deepEqual(existing.planDocumentIds, ["doc-new", "doc-old"]);
  assert.deepEqual(existing.observedDocumentSha256s, [newHash]);
  assert.equal(existing.quality.coldReviewCompletedAt, "2026-08-12T15:00:00.000Z");
  assert.equal(added.editorialStatus, "pending");

  assert.deepEqual(
    merged.documents.map(({ id }) => id).sort(),
    ["doc-new", "doc-old"],
  );
  assert.deepEqual(
    merged.findings.filter(({ candidacyId }) => candidacyId === "100"),
    [reviewedFinding, closedFinding],
  );
  assert.deepEqual(
    merged.findings.filter(({ candidacyId }) => candidacyId === "200").map(({ status }) => status),
    ["pending", "pending"],
  );
  assert.deepEqual(merged.proposals, [proposal]);
  assert.deepEqual(merged.sourceChangedCandidateIds, ["100"]);
});
