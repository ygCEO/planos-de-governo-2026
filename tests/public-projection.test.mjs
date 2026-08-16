import assert from "node:assert/strict";
import test from "node:test";
import { projectPublicDataset } from "../scripts/data/build-snapshot.mjs";

const internalQuality = {
  firstPassCompletedAt: "2026-08-10T10:00:00Z",
  secondPassCompletedAt: "2026-08-11T10:00:00Z",
  coldReviewCompletedAt: null,
  retestCompletedAt: null,
  readingHours: 8,
};

test("projeção pública oculta trabalho editorial de candidatura incompleta", () => {
  const dataset = {
    candidacies: [
      { id: "published", editorialStatus: "published", reconciliationStatus: "reconciled", quality: internalQuality },
      { id: "draft", editorialStatus: "in_review", reconciliationStatus: "reconciled", quality: internalQuality },
    ],
    findings: [
      { candidacyId: "published", themeId: "saude", status: "not_found", proposalIds: [], evidence: [], reviewedAt: "2026-08-14T10:00:00Z", note: "leitura integral" },
      { candidacyId: "draft", themeId: "saude", status: "diagnosis_only", proposalIds: [], evidence: [{ quote: "conteúdo ainda não publicado" }], reviewedAt: "2026-08-12T10:00:00Z", note: "nota interna" },
    ],
    proposals: [
      { id: "p-published", candidacyId: "published" },
      { id: "p-draft", candidacyId: "draft", quoteFull: "proposta ainda não publicada" },
    ],
    codingDecisions: [
      { id: "d-published", candidacyId: "published" },
      { id: "d-draft", candidacyId: "draft", rationale: "decisão ainda não publicada" },
    ],
  };

  const result = projectPublicDataset(dataset);
  const draft = result.candidacies.find((candidate) => candidate.id === "draft");
  const draftFinding = result.findings.find((finding) => finding.candidacyId === "draft");

  assert.deepEqual(draft.quality, {
    firstPassCompletedAt: null,
    secondPassCompletedAt: null,
    coldReviewCompletedAt: null,
    retestCompletedAt: null,
    readingHours: null,
  });
  assert.deepEqual(draftFinding, {
    candidacyId: "draft",
    themeId: "saude",
    status: "pending",
    proposalIds: [],
    evidence: [],
    reviewedAt: null,
    note: null,
  });
  assert.deepEqual(result.proposals.map(({ id }) => id), ["p-published"]);
  assert.deepEqual(result.codingDecisions.map(({ id }) => id), ["d-published"]);
  assert.equal(result.findings[0].status, "not_found");
  assert.equal(result.candidacies[0].quality.readingHours, 8);
});
