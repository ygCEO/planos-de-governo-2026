#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { candidacySchema, datasetSchema, planDocumentVersionSchema } from "../../lib/data/schema.js";
import { isOfficialSecondRoundStatus } from "../../lib/data/round-status.js";
import { stringifyCsv } from "../lib/csv.mjs";
import { mergeEditorialMetadata } from "../lib/editorial-merge.mjs";
import { compareCandidateMetadata, compareDocumentCorpora } from "../lib/reconciliation.mjs";
import { semanticSyncSignature } from "../tse/sync-metadata.mjs";
import { validatePublicSnapshotIntegrity } from "./validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const latest = JSON.parse(await readFile(join(root, "lib/data/generated/latest.json"), "utf8"));
assert((await validatePublicSnapshotIntegrity(root)).snapshots >= 1);

function issuesFor(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues;
}

const csvCandidate = {
  NM_URNA_CANDIDATO: "Flávio   Bolsonaro",
  NR_CANDIDATO: "22",
  SG_PARTIDO: "PL",
  DS_SITUACAO_CANDIDATURA: "#NE",
};
const restCandidate = {
  ballotName: "FLAVIO BOLSONARO",
  ballotNumber: 22,
  partyAcronym: "pl",
  officialStatus: "Aguardando julgamento",
};
assert.equal(compareCandidateMetadata(csvCandidate, restCandidate).matches, true);
const metadataMismatch = compareCandidateMetadata(csvCandidate, { ...restCandidate, ballotNumber: 23, partyAcronym: "XX" });
assert.deepEqual(metadataMismatch.mismatchedFields, ["ballotNumber", "partyAcronym"]);

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
assert.equal(compareDocumentCorpora([{ position: 0, sha256: digestA }], [digestA]).matches, true);
const completeCorpus = compareDocumentCorpora([
  { position: 0, sha256: digestA },
  { position: 1, sha256: digestB },
], [digestA]);
assert.equal(completeCorpus.matches, false);
assert.deepEqual(completeCorpus.restOnlySha256s, [digestB]);
assert.equal(compareDocumentCorpora([
  { position: 0, sha256: digestA },
  { position: 1, sha256: digestA },
], [digestA]).matches, false);

const semanticSignature = semanticSyncSignature({ candidates: latest.candidacies, documents: latest.documents, source: latest.source });
const rawMetadataOnly = structuredClone(latest);
rawMetadataOnly.source.observedAt = "2026-08-16T00:00:00.000Z";
rawMetadataOnly.source.csvGeneratedAt = "2026-08-16T00:00:00.000Z";
rawMetadataOnly.source.ckanMetadataModifiedAt = "2026-08-16T00:00:00.000Z";
rawMetadataOnly.source.resources[0].sha256 = digestA;
rawMetadataOnly.source.resources[0].etag = "novo-etag-sem-mudanca-semantica";
rawMetadataOnly.candidacies[0].sourceObservedAt = "2026-08-16T00:00:00.000Z";
assert.equal(semanticSyncSignature({ candidates: rawMetadataOnly.candidacies, documents: rawMetadataOnly.documents, source: rawMetadataOnly.source }), semanticSignature);
const semanticChange = structuredClone(latest);
semanticChange.candidacies[0].ballotName = `${semanticChange.candidacies[0].ballotName} ALTERADO`;
assert.notEqual(semanticSyncSignature({ candidates: semanticChange.candidacies, documents: semanticChange.documents, source: semanticChange.source }), semanticSignature);

const stableCandidate = structuredClone(latest.candidacies.find((item) => item.id === "280002539826"));
const stableDocument = structuredClone(latest.documents.find((item) => item.candidacyId === stableCandidate.id));
stableCandidate.observedDocumentSha256s = [stableDocument.sha256];
stableCandidate.observedDocumentCorpora = { zipSha256s: [stableDocument.sha256], restSha256s: [stableDocument.sha256] };
stableCandidate.corpusObservedAt = stableCandidate.sourceObservedAt;
const laterCandidate = structuredClone(stableCandidate);
laterCandidate.sourceObservedAt = "2026-08-16T00:00:00.000Z";
laterCandidate.corpusObservedAt = laterCandidate.sourceObservedAt;
const stableMerge = mergeEditorialMetadata({
  observedCandidates: [laterCandidate],
  observedDocuments: [stableDocument],
  existingCandidates: [stableCandidate],
  existingDocuments: [stableDocument],
  existingFindings: latest.findings.filter((finding) => finding.candidacyId === stableCandidate.id),
  existingProposals: [],
  themes: latest.themes,
});
assert.equal(stableMerge.candidates[0].corpusObservedAt, stableCandidate.corpusObservedAt);
const changedDocument = {
  ...structuredClone(stableDocument),
  id: `doc-${stableCandidate.id}-${digestB.slice(0, 16)}`,
  sha256: digestB,
  preservedObjectKey: `pdf/${digestB}.pdf`,
};
const changedCandidate = {
  ...structuredClone(laterCandidate),
  planDocumentIds: [changedDocument.id],
  observedDocumentSha256s: [digestB],
  observedDocumentCorpora: { zipSha256s: [digestB], restSha256s: [digestB] },
};
const changedMerge = mergeEditorialMetadata({
  observedCandidates: [changedCandidate],
  observedDocuments: [changedDocument],
  existingCandidates: [stableCandidate],
  existingDocuments: [stableDocument],
  existingFindings: latest.findings.filter((finding) => finding.candidacyId === stableCandidate.id),
  existingProposals: [],
  themes: latest.themes,
});
assert.equal(changedMerge.candidates[0].editorialStatus, "source_changed");
assert.equal(changedMerge.candidates[0].corpusObservedAt, changedCandidate.corpusObservedAt);

const pendingDocumentsCandidate = structuredClone(stableCandidate);
pendingDocumentsCandidate.reconciliationStatus = "pending_documents";
pendingDocumentsCandidate.editorialStatus = "pending";
assert(issuesFor(candidacySchema, pendingDocumentsCandidate).some((issue) => issue.code === "reconciliation_gate"));
pendingDocumentsCandidate.editorialStatus = "awaiting_consolidation";
assert.doesNotThrow(() => candidacySchema.parse(pendingDocumentsCandidate));

const document = structuredClone(latest.documents[0]);
assert.doesNotThrow(() => planDocumentVersionSchema.parse(document));
const badCanonical = structuredClone(document);
badCanonical.canonicalUrl = "https://divulgacandcontas.tse.jus.br.evil.example/arquivo.pdf";
assert(issuesFor(planDocumentVersionSchema, badCanonical).some((issue) => issue.code === "official_url"));
const badSource = structuredClone(document);
badSource.sources[0].url = "https://example.org/fonte.pdf";
assert(issuesFor(planDocumentVersionSchema, badSource).some((issue) => issue.code === "official_url"));
const badKey = structuredClone(document);
badKey.preservedObjectKey = `pdf/${digestA}.pdf`;
assert(issuesFor(planDocumentVersionSchema, badKey).some((issue) => issue.code === "preserved_key"));
const validRelativeUrl = structuredClone(document);
validRelativeUrl.preservedPublicUrl = `/arquivos/${document.sha256}`;
assert.doesNotThrow(() => planDocumentVersionSchema.parse(validRelativeUrl));
const validWorkerUrl = structuredClone(document);
validWorkerUrl.preservedPublicUrl = `https://planos-de-governo-2026.exemplo.workers.dev/arquivos/${document.sha256}`;
assert.doesNotThrow(() => planDocumentVersionSchema.parse(validWorkerUrl));
const badPublicHost = structuredClone(document);
badPublicHost.preservedPublicUrl = `https://example.org/arquivos/${document.sha256}`;
assert(issuesFor(planDocumentVersionSchema, badPublicHost).some((issue) => issue.code === "preserved_url"));
const badPublicDigest = structuredClone(document);
badPublicDigest.preservedPublicUrl = `/arquivos/${digestA}`;
assert(issuesFor(planDocumentVersionSchema, badPublicDigest).some((issue) => issue.code === "preserved_url"));

assert.equal(isOfficialSecondRoundStatus("Eleito no 2º turno"), true);
assert.equal(isOfficialSecondRoundStatus("CLASSIFICADO PARA O 2o TURNO"), true);
assert.equal(isOfficialSecondRoundStatus("Aguardando julgamento"), false);
assert.equal(isOfficialSecondRoundStatus(null), false);

const dangerousCsv = stringifyCsv(["value"], [
  { value: "=1+1" },
  { value: "+SUM(A1:A2)" },
  { value: "-2+3" },
  { value: "@cmd" },
  { value: "\tformula" },
  { value: "\rformula" },
]);
for (const value of ["'=1+1", "'+SUM(A1:A2)", "'-2+3", "'@cmd", "'\tformula", "'\rformula"]) {
  assert(dangerousCsv.includes(`"${value}"`));
}

const candidateId = "280002539826";
const sourceVersionFixture = structuredClone(latest);
const candidate = sourceVersionFixture.candidacies.find((item) => item.id === candidateId);
const oldDocument = sourceVersionFixture.documents.find((item) => item.candidacyId === candidateId);
const newDigest = "f".repeat(64);
const newDocument = {
  ...structuredClone(oldDocument),
  id: `doc-${candidateId}-${newDigest.slice(0, 16)}`,
  sha256: newDigest,
  preservedObjectKey: `pdf/${newDigest}.pdf`,
  preservedPublicUrl: `/arquivos/${newDigest}`,
  preservationStatus: "preserved",
  pageCountVerified: true,
};
oldDocument.preservedPublicUrl = `/arquivos/${oldDocument.sha256}`;
oldDocument.preservationStatus = "preserved";
oldDocument.pageCountVerified = true;
sourceVersionFixture.documents.push(newDocument);
candidate.editorialStatus = "published";
candidate.reconciliationStatus = "reconciled";
candidate.planDocumentIds.push(newDocument.id);
candidate.observedDocumentSha256s = [newDigest];
candidate.observedDocumentCorpora = { zipSha256s: [newDigest], restSha256s: [newDigest] };
candidate.quality = {
  firstPassCompletedAt: "2026-08-16T00:00:00.000Z",
  secondPassCompletedAt: "2026-08-16T01:00:00.000Z",
  coldReviewCompletedAt: "2026-08-18T02:00:00.000Z",
  retestCompletedAt: null,
  readingHours: 8,
};
const proposal = {
  id: "proposal-source-version-regression",
  candidacyId: candidateId,
  canonicalOccurrenceId: "occ-source-version-regression",
  occurrences: [{
    id: "occ-source-version-regression",
    documentId: oldDocument.id,
    section: null,
    physicalPage: 1,
    printedPage: null,
    quote: "Trecho literal de teste.",
    visualVerified: true,
  }],
  quoteShort: "Trecho literal de teste.",
  quoteFull: "Trecho literal de teste.",
  primaryThemeId: "economia-impostos",
  secondaryTagIds: [],
  documentOrder: 1,
  criteria: {
    a1ActionCommitment: true,
    a2IdentifiableObject: true,
    a3FederalExecutiveAgent: true,
    rationale: "Fixture de regressão.",
  },
  codedAt: "2026-08-16T00:00:00.000Z",
  coldReviewedAt: "2026-08-18T02:00:00.000Z",
  sourceDocumentSha256: oldDocument.sha256,
};
sourceVersionFixture.proposals.push(proposal);
sourceVersionFixture.codingDecisions.push({
  id: "decision-source-version-regression",
  candidacyId: candidateId,
  proposalId: proposal.id,
  type: "inclusion",
  rule: "A1",
  rationale: "Fixture de regressão.",
  decidedAt: "2026-08-16T00:00:00.000Z",
  coldReviewedAt: "2026-08-18T02:00:00.000Z",
  reviewer: "fixture",
});
for (const finding of sourceVersionFixture.findings.filter((item) => item.candidacyId === candidateId)) {
  finding.status = "not_found";
  finding.proposalIds = [];
  finding.evidence = [];
  finding.reviewedAt = "2026-08-18T02:00:00.000Z";
  finding.note = "Não foi identificada menção após leitura integral.";
}
const proposalFinding = sourceVersionFixture.findings.find((item) => item.candidacyId === candidateId && item.themeId === proposal.primaryThemeId);
proposalFinding.status = "proposals";
proposalFinding.proposalIds = [proposal.id];
proposalFinding.note = null;
sourceVersionFixture.release.publishedCandidateIds = [candidateId];
const staleIssues = issuesFor(datasetSchema, sourceVersionFixture);
assert(staleIssues.some((issue) => issue.code === "source_version" && issue.path.includes(proposal.id)));

proposal.occurrences[0].documentId = newDocument.id;
proposal.sourceDocumentSha256 = newDigest;
assert.doesNotThrow(() => datasetSchema.parse(sourceVersionFixture));

const missingCorporaFixture = structuredClone(sourceVersionFixture);
delete missingCorporaFixture.candidacies.find((item) => item.id === candidateId).observedDocumentCorpora;
assert(issuesFor(datasetSchema, missingCorporaFixture).some((issue) => issue.code === "source_corpus"));
const mismatchedCorporaFixture = structuredClone(sourceVersionFixture);
mismatchedCorporaFixture.candidacies.find((item) => item.id === candidateId).observedDocumentCorpora.restSha256s = [oldDocument.sha256];
assert(issuesFor(datasetSchema, mismatchedCorporaFixture).some((issue) => issue.code === "source_corpus"));
const forgedReconciliationFixture = structuredClone(sourceVersionFixture);
const forgedCandidate = forgedReconciliationFixture.candidacies.find((item) => item.id === candidateId);
forgedCandidate.sourceIds.csvCandidateId = null;
forgedCandidate.officialStatus.source = "divulgacand-rest";
assert(issuesFor(datasetSchema, forgedReconciliationFixture).some((issue) => issue.code === "reconciliation_gate"));

const omittedProposalFixture = structuredClone(sourceVersionFixture);
const omittedFinding = omittedProposalFixture.findings.find((item) => item.candidacyId === candidateId && item.themeId === proposal.primaryThemeId);
omittedFinding.status = "not_found";
omittedFinding.proposalIds = [];
const omittedIssues = issuesFor(datasetSchema, omittedProposalFixture);
assert(omittedIssues.some((issue) => issue.code === "proposal_finding_bijection"));

console.log("DATA_REGRESSIONS_OK: reconciliação, URLs, versões de fonte, turno e CSV protegidos");
