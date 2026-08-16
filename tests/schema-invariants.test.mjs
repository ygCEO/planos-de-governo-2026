import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DataValidationError, validateDataset } from "../lib/data/schema.js";

const instant = {
  observed: "2026-08-01T00:00:00Z",
  firstPass: "2026-08-01T12:00:00Z",
  secondPass: "2026-08-02T12:00:00Z",
  coldReview: "2026-08-04T12:00:00Z",
};
const documentHash = "a".repeat(64);

async function catalog(name) {
  return JSON.parse(
    await readFile(new URL(`../content/catalog/${name}.yaml`, import.meta.url), "utf8"),
  );
}

async function validDataset() {
  const [themes, secondaryTags] = await Promise.all([
    catalog("temas"),
    catalog("etiquetas"),
  ]);
  const candidateId = "100000000001";
  const occurrence = {
    id: "occ-1",
    documentId: "doc-1",
    section: "Saúde",
    physicalPage: 2,
    printedPage: "1",
    quote: "Ampliar a atenção básica em todo o território nacional.",
    visualVerified: true,
  };
  const findings = themes.map((theme) => ({
    candidacyId: candidateId,
    themeId: theme.id,
    status: theme.id === "saude" ? "proposals" : "not_found",
    proposalIds: theme.id === "saude" ? ["prop-1"] : [],
    evidence: [],
    reviewedAt: instant.coldReview,
    note: null,
  }));

  return {
    schemaVersion: "1.0.0",
    release: {
      id: "2026-08-15.1",
      schemaVersion: "1.0.0",
      methodologyVersion: "1.0",
      createdAt: instant.observed,
      sourceObservedAt: instant.observed,
      candidateIds: [candidateId],
      publishedCandidateIds: [candidateId],
      sourceStatus: "stable",
      contentSha256: "pending",
      files: [],
    },
    methodology: {
      version: "1.0",
      status: "frozen",
      releasedAt: instant.observed,
      sourcePath: "content/metodologia/1.0.md",
      commit: "c".repeat(40),
      changelog: ["Metodologia congelada antes da codificação."],
    },
    source: {
      datasetId: "candidatos-2026",
      datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
      licenseId: "cc-by",
      ckanMetadataModifiedAt: instant.observed,
      observedAt: instant.observed,
      csvGeneratedAt: instant.observed,
      resources: [],
      rest: {
        url: "https://divulgacandcontas.tse.jus.br/",
        observedAt: instant.observed,
        electionId: "20322002026",
        candidateIds: [candidateId],
        planDocuments: [],
      },
      reconciliation: {
        csvOnlyCandidateIds: [],
        restOnlyCandidateIds: [],
        currentRestDocumentsMissingFromZip: [],
        zipDocumentsMissingFromRest: [],
      },
    },
    themes,
    secondaryTags,
    candidacies: [{
      id: candidateId,
      sqCandidate: candidateId,
      electionYear: 2026,
      electionId: "6257",
      ballotName: "CANDIDATURA TESTE",
      ballotNumber: 99,
      party: { acronym: "TST", name: "Partido Teste" },
      office: "presidente",
      jurisdiction: "BR",
      officialStatus: { code: "1", label: "Apto", source: "reconciled", observedAt: instant.observed },
      editorialStatus: "published",
      reconciliationStatus: "reconciled",
      sourceIds: {
        csvCandidateId: candidateId,
        restCandidateId: candidateId,
        csvElectionCode: "6257",
        restElectionId: "6257",
      },
      planDocumentIds: ["doc-1"],
      observedDocumentSha256s: [documentHash],
      observedDocumentCorpora: {
        zipSha256s: [documentHash],
        restSha256s: [documentHash],
      },
      sourceObservedAt: instant.observed,
      quality: {
        firstPassCompletedAt: instant.firstPass,
        secondPassCompletedAt: instant.secondPass,
        coldReviewCompletedAt: instant.coldReview,
        retestCompletedAt: null,
        readingHours: 8,
      },
    }],
    documents: [{
      id: "doc-1",
      candidacyId: candidateId,
      officialFilename: "plano.pdf",
      mimeType: "application/pdf",
      canonicalUrl: "https://divulgacandcontas.tse.jus.br/plano.pdf",
      capturedAt: instant.observed,
      sha256: documentHash,
      byteSize: 2048,
      pageCount: 10,
      pageCountVerified: true,
      preservedObjectKey: `pdf/${documentHash}.pdf`,
      preservedPublicUrl: `/arquivos/${documentHash}`,
      preservationStatus: "preserved",
      supersedesDocumentId: null,
      sources: [{
        kind: "ckan_zip",
        url: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026.zip",
        resourceId: "resource-1",
        documentId: null,
        archiveEntry: "BR/plano.pdf",
        observedAt: instant.observed,
      }],
    }],
    findings,
    proposals: [{
      id: "prop-1",
      candidacyId: candidateId,
      canonicalOccurrenceId: occurrence.id,
      occurrences: [occurrence],
      quoteShort: occurrence.quote,
      quoteFull: occurrence.quote,
      primaryThemeId: "saude",
      secondaryTagIds: [],
      documentOrder: 1,
      criteria: {
        a1ActionCommitment: true,
        a2IdentifiableObject: true,
        a3FederalExecutiveAgent: true,
        rationale: "Ação concreta atribuída ao governo federal.",
      },
      codedAt: instant.secondPass,
      coldReviewedAt: instant.coldReview,
      sourceDocumentSha256: documentHash,
    }],
    codingDecisions: [{
      id: "decision-1",
      candidacyId: candidateId,
      proposalId: "prop-1",
      type: "inclusion",
      rule: "A1",
      rationale: "A ocorrência satisfaz A1, A2 e A3.",
      decidedAt: instant.secondPass,
      coldReviewedAt: instant.coldReview,
      reviewer: "codificador-1",
    }],
  };
}

function expectInvalid(dataset, expected) {
  assert.throws(
    () => validateDataset(dataset),
    (error) => error instanceof DataValidationError && expected.test(error.message),
  );
}

test("aceita candidatura completa com 13 temas fechados", async () => {
  const dataset = await validDataset();
  assert.equal(validateDataset(dataset), dataset);
});

test("aceita finding unverifiable fechado, sem tratá-lo como ausência", async () => {
  const dataset = await validDataset();
  const finding = dataset.findings.find(({ themeId }) => themeId === "educacao");
  finding.status = "unverifiable";
  finding.note = "Duas páginas do PDF oficial estão ilegíveis; impedimento conferido visualmente.";

  assert.equal(validateDataset(dataset), dataset);
});

test("exige motivo documentado para finding unverifiable", async () => {
  const dataset = await validDataset();
  const finding = dataset.findings.find(({ themeId }) => themeId === "educacao");
  finding.status = "unverifiable";
  finding.note = null;
  expectInvalid(dataset, /unverifiable exige impedimento documentado/);
});

test("bloqueia candidatura publicada com cobertura incompleta ou pendente", async () => {
  const incomplete = await validDataset();
  incomplete.findings.pop();
  expectInvalid(incomplete, /exatamente um registro para cada um dos 13 temas/);

  const pending = await validDataset();
  pending.findings.find(({ themeId }) => themeId === "educacao").status = "pending";
  pending.findings.find(({ themeId }) => themeId === "educacao").reviewedAt = null;
  expectInvalid(pending, /publicação exige os 13 temas fechados/);
});

test("impede ausência ou diagnóstico de coexistir com proposta", async () => {
  const notFound = await validDataset();
  const health = notFound.findings.find(({ themeId }) => themeId === "saude");
  health.status = "not_found";
  expectInvalid(notFound, /somente o estado proposals pode referenciar propostas/);

  const diagnosis = await validDataset();
  const education = diagnosis.findings.find(({ themeId }) => themeId === "educacao");
  education.status = "diagnosis_only";
  education.evidence = [];
  expectInvalid(diagnosis, /diagnosis_only exige citação e página/);
});

test("diagnóstico exige evidência visualmente conferida", async () => {
  const dataset = await validDataset();
  const education = dataset.findings.find(({ themeId }) => themeId === "educacao");
  education.status = "diagnosis_only";
  education.evidence = [{
    ...structuredClone(dataset.proposals[0].occurrences[0]),
    id: "diagnostico-1",
    visualVerified: false,
  }];
  expectInvalid(dataset, /diagnóstico exige evidência conferida visualmente/);
});

test("evidências respeitam candidatura, documento e limites de página", async () => {
  const proposal = await validDataset();
  proposal.proposals[0].occurrences[0].physicalPage = 999;
  expectInvalid(proposal, /página física 999 excede/);

  const diagnosis = await validDataset();
  const education = diagnosis.findings.find(({ themeId }) => themeId === "educacao");
  education.status = "diagnosis_only";
  education.evidence = [{
    ...structuredClone(diagnosis.proposals[0].occurrences[0]),
    id: "diagnostico-2",
    documentId: "doc-inexistente",
  }];
  expectInvalid(diagnosis, /documento doc-inexistente inexistente ou de outra candidatura/);
});

test("exige revisão fria de 48 horas na candidatura e na proposta", async () => {
  const candidacy = await validDataset();
  candidacy.candidacies[0].quality.coldReviewCompletedAt = "2026-08-04T11:59:59Z";
  expectInvalid(candidacy, /revisão fria ao menos 48 horas/);

  const proposal = await validDataset();
  proposal.proposals[0].coldReviewedAt = "2026-08-04T11:59:59Z";
  expectInvalid(proposal, /revisão fria deve ocorrer ao menos 48 horas/);
});

test("publicação exige protocolo de duas leituras e horas registradas", async () => {
  const missingFirstPass = await validDataset();
  missingFirstPass.candidacies[0].quality.firstPassCompletedAt = null;
  expectInvalid(missingFirstPass, /primeira e segunda leituras em ordem cronológica/);

  const missingHours = await validDataset();
  missingHours.candidacies[0].quality.readingHours = null;
  expectInvalid(missingHours, /horas de leitura registradas/);
});

test("bloqueia herança de citação entre versões e exige conferência visual", async () => {
  const wrongHash = await validDataset();
  wrongHash.proposals[0].sourceDocumentSha256 = "b".repeat(64);
  expectInvalid(wrongHash, /hash não corresponde ao documento/);

  const unverified = await validDataset();
  unverified.proposals[0].occurrences[0].visualVerified = false;
  expectInvalid(unverified, /toda citação exige conferência visual/);
});

test("citação pública permanece literal e possui decisão de codificação", async () => {
  const paraphrase = await validDataset();
  paraphrase.proposals[0].quoteFull = "Resumo editorial que não existe no documento.";
  expectInvalid(paraphrase, /citação completa deve ser idêntica à ocorrência canônica/);

  const invalidExcerpt = await validDataset();
  invalidExcerpt.proposals[0].quoteShort = "Ampliar muito a atenção básica.";
  expectInvalid(invalidExcerpt, /citação curta deve ser literal ou usar cortes marcados/);

  const noDecision = await validDataset();
  noDecision.codingDecisions = [];
  expectInvalid(noDecision, /proposta exige decisão registrada/);
});

test("não publica documento sem páginas verificadas ou preservação imutável", async () => {
  const noText = await validDataset();
  noText.documents[0].pageCount = null;
  noText.documents[0].pageCountVerified = false;
  expectInvalid(noText, /ainda não está preservado e verificado/);

  const notArchived = await validDataset();
  notArchived.documents[0].preservationStatus = "pending_upload";
  notArchived.documents[0].preservedPublicUrl = null;
  expectInvalid(notArchived, /ainda não está preservado e verificado/);

  const noDocument = await validDataset();
  noDocument.candidacies[0].planDocumentIds = [];
  noDocument.documents = [];
  noDocument.proposals = [];
  const health = noDocument.findings.find(({ themeId }) => themeId === "saude");
  health.status = "not_found";
  health.proposalIds = [];
  expectInvalid(noDocument, /publicação exige ao menos um documento oficial/);
});

test("snapshot público exige metodologia congelada, commit completo e versão coincidente", async () => {
  const draft = await validDataset();
  draft.methodology.status = "draft";
  draft.methodology.commit = null;
  expectInvalid(draft, /snapshot público exige metodologia congelada/);
  expectInvalid(draft, /snapshot público exige commit completo/);

  const mismatch = await validDataset();
  mismatch.release.methodologyVersion = "0.9";
  expectInvalid(mismatch, /deve coincidir com a metodologia incluída/);
});

test("rejeita campos pessoais mesmo quando aninhados", async () => {
  for (const field of ["nrCpfCandidato", "nmEmail", "dsEndereco", "nrTelefone", "cep"]) {
    const dataset = await validDataset();
    dataset.candidacies[0].party[field] = "dado que não deve ser persistido";
    expectInvalid(dataset, /campo sensível não pode ser persistido/);
  }
});
