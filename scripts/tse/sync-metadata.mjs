#!/usr/bin/env node
import { basename, join } from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCsvRecords } from "../lib/csv.mjs";
import { listFiles, parseCliArgs, readYaml, resolveRoot, sha256, stableJson, writeYaml } from "../lib/io.mjs";
import { readZipEntries } from "../lib/zip.mjs";
import { mergeEditorialMetadata } from "../lib/editorial-merge.mjs";
import { compareCandidateMetadata, compareDocumentCorpora, restDocumentsMissingFromZip } from "../lib/reconciliation.mjs";

const CKAN_PACKAGE = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026";
const CKAN_DATASET = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";
const REST_ELECTION_ID = "20322002026";
const REST_CANDIDATES = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/2026/BR/${REST_ELECTION_ID}/1/candidatos`;
const SAFE_CSV_FIELDS = Object.freeze([
  "DT_GERACAO",
  "HH_GERACAO",
  "CD_ELEICAO",
  "CD_CARGO",
  "DS_CARGO",
  "SQ_CANDIDATO",
  "NR_CANDIDATO",
  "NM_URNA_CANDIDATO",
  "CD_SITUACAO_CANDIDATURA",
  "DS_SITUACAO_CANDIDATURA",
  "NR_PARTIDO",
  "SG_PARTIDO",
  "NM_PARTIDO",
]);

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchBytes(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json, application/zip, application/pdf;q=0.9, */*;q=0.1" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, headers: response.headers };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await pause(750 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${lastError?.message ?? "erro desconhecido"}`);
}

async function fetchJson(url) {
  const { bytes, headers } = await fetchBytes(url);
  return { value: JSON.parse(bytes.toString("utf8")), bytes, headers };
}

async function fetchArchive(url, environmentKey) {
  const localPath = process.env[environmentKey];
  if (!localPath) return fetchBytes(url);
  return { bytes: await readFile(localPath), headers: new Headers() };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

function allowlistedCsvRow(row) {
  return Object.fromEntries(SAFE_CSV_FIELDS.map((field) => [field, row[field] ?? ""]));
}

function allowlistedRestCandidate(candidate) {
  return {
    id: String(candidate.id),
    ballotName: String(candidate.nomeUrna ?? "").trim(),
    ballotNumber: Number(candidate.numero),
    officialStatus: String(candidate.descricaoSituacao ?? "Situação não informada"),
    totalizationStatus: String(candidate.descricaoTotalizacao ?? "").trim(),
    partyAcronym: String(candidate.partido?.sigla ?? candidate.nomeColigacao ?? "").trim(),
    partyName: typeof candidate.partido?.nome === "string" ? candidate.partido.nome.trim() : null,
    restElectionId: candidate.eleicao?.id === null || candidate.eleicao?.id === undefined
      ? REST_ELECTION_ID
      : String(candidate.eleicao.id),
  };
}

function parseTseGeneratedAt(row) {
  if (!row?.DT_GERACAO || !row?.HH_GERACAO) return null;
  const [day, month, year] = row.DT_GERACAO.split("/");
  const candidate = new Date(`${year}-${month}-${day}T${row.HH_GERACAO}-03:00`);
  return Number.isNaN(candidate.valueOf()) ? null : candidate.toISOString();
}

function headerIso(headers, name) {
  const value = headers.get(name);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function maxIso(...values) {
  const valid = values.filter(Boolean).sort();
  return valid.at(-1) ?? new Date().toISOString();
}

function estimatedPdfPages(bytes) {
  const source = bytes.toString("latin1");
  const counts = [...source.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,240}?\/Count\s+(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((count) => Number.isInteger(count) && count > 0 && count < 10_000);
  return counts.length ? Math.max(...counts) : null;
}

function assertPdf(bytes, label) {
  if (bytes.length < 8 || !/%PDF-\d\.\d/.test(bytes.subarray(0, Math.min(bytes.length, 1_024)).toString("latin1"))) {
    throw new Error(`${label}: resposta não contém um PDF válido`);
  }
}

function nextSnapshotId(existingIds, instant) {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const prefix = `${localDate}.`;
  const sequence = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${prefix}${Math.max(0, ...sequence) + 1}`;
}

export function semanticSyncSignature({ candidates = [], documents = [], source }) {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const restDocumentsByCandidate = new Map();
  for (const document of source?.rest?.planDocuments ?? []) {
    const entries = restDocumentsByCandidate.get(document.candidacyId) ?? [];
    entries.push(document);
    restDocumentsByCandidate.set(document.candidacyId, entries);
  }
  const candidateProjection = candidates.map((candidate) => {
    const inferredZipDocuments = (candidate.planDocumentIds ?? [])
      .flatMap((documentId) => {
        const document = documentsById.get(documentId);
        if (!document) return [];
        return document.sources
          .filter((item) => item.kind === "ckan_zip")
          .map((item) => ({ archiveEntry: item.archiveEntry ?? "", officialFilename: document.officialFilename, sha256: document.sha256 }));
      })
      .sort((left, right) => left.archiveEntry.localeCompare(right.archiveEntry));
    const restDocuments = [...(restDocumentsByCandidate.get(candidate.id) ?? [])]
      .sort((left, right) => left.position - right.position);
    return {
      id: candidate.id,
      ballotName: candidate.ballotName,
      ballotNumber: candidate.ballotNumber,
      party: candidate.party,
      officialStatus: {
        code: candidate.officialStatus?.code,
        label: candidate.officialStatus?.label,
        source: candidate.officialStatus?.source,
      },
      officialTotalizationStatus: {
        label: candidate.officialTotalizationStatus?.label ?? null,
        source: candidate.officialTotalizationStatus?.label ? "divulgacand-rest" : "unknown",
      },
      reconciliationStatus: candidate.reconciliationStatus,
      sourceIds: candidate.sourceIds,
      zipDocuments: inferredZipDocuments,
      documentCorpora: candidate.observedDocumentCorpora ?? {
        zipSha256s: inferredZipDocuments.map((document) => document.sha256),
        restSha256s: restDocuments.map((document) => document.sha256),
      },
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const sourceProjection = {
    datasetId: source?.datasetId,
    datasetUrl: source?.datasetUrl,
    licenseId: source?.licenseId,
    resources: (source?.resources ?? []).map((resource) => ({
      id: resource.id,
      name: resource.name,
      format: resource.format,
      url: resource.url,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    rest: {
      url: source?.rest?.url,
      electionId: source?.rest?.electionId,
      candidateIds: [...(source?.rest?.candidateIds ?? [])].sort(),
      planDocuments: (source?.rest?.planDocuments ?? []).map((document) => ({
        candidacyId: document.candidacyId,
        documentId: document.documentId,
        officialFilename: document.officialFilename,
        canonicalUrl: document.canonicalUrl,
        position: document.position,
        sha256: document.sha256,
        byteSize: document.byteSize,
      })).sort((left, right) => left.candidacyId.localeCompare(right.candidacyId) || left.position - right.position),
    },
  };
  return sha256(stableJson({ candidates: candidateProjection, source: sourceProjection }));
}

async function maybeRead(path) {
  try {
    return await readYaml(path);
  } catch (error) {
    if (error.cause?.code === "ENOENT" || error.code === "ENOENT" || String(error.message).includes("ENOENT")) return null;
    return null;
  }
}

async function existingReleaseIds(root) {
  try {
    const current = await maybeRead(join(root, "content/releases/current.yaml"));
    return current?.id ? [current.id] : [];
  } catch {
    return [];
  }
}

async function readMany(directory) {
  const paths = await listFiles(directory, ".yaml");
  return Promise.all(paths.map(readYaml));
}

export async function collectTseMetadata() {
  const ckan = await fetchJson(CKAN_PACKAGE);
  if (!ckan.value.success || !ckan.value.result) throw new Error("Catálogo CKAN não retornou um conjunto válido");
  const resources = ckan.value.result.resources ?? [];
  const candidateResource = resources.find((resource) => resource.name === "Candidatos");
  const proposalResource = resources.find((resource) => resource.name === "BR - Proposta de governo");
  if (!candidateResource || !proposalResource) throw new Error("Recursos Candidatos ou BR - Proposta de governo não encontrados no CKAN");

  const [candidateArchive, proposalArchive, restResponse] = await Promise.all([
    fetchArchive(candidateResource.url, "TSE_CANDIDATES_ARCHIVE"),
    fetchArchive(proposalResource.url, "TSE_PROPOSALS_ARCHIVE"),
    fetchJson(REST_CANDIDATES),
  ]);
  const candidateEntries = readZipEntries(candidateArchive.bytes);
  const candidateCsv = candidateEntries.find((entry) => entry.name === "consulta_cand_2026_BR.csv");
  if (!candidateCsv) throw new Error("consulta_cand_2026_BR.csv não encontrado no ZIP oficial");
  const allCsvRows = parseCsvRecords(new TextDecoder("windows-1252").decode(candidateCsv.data), ";");
  const csvRows = allCsvRows
    .filter((row) => row.CD_CARGO === "1" || row.DS_CARGO.toLocaleUpperCase("pt-BR") === "PRESIDENTE")
    .map(allowlistedCsvRow);
  const restCandidates = (restResponse.value.candidatos ?? []).map(allowlistedRestCandidate);
  const restPlanDocumentMetadata = (await mapWithConcurrency(restCandidates, 3, async (candidate) => {
    const detailUrl = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/${REST_ELECTION_ID}/candidato/${candidate.id}`;
    const detail = await fetchJson(detailUrl);
    return (detail.value.arquivos ?? [])
      .filter((file) => String(file.codTipo) === "5")
      .map((file, position) => ({
        candidacyId: candidate.id,
        documentId: String(file.idArquivo),
        officialFilename: String(file.nome ?? `documento-${file.idArquivo}.pdf`),
        canonicalUrl: `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/${file.idArquivo}`,
        position,
      }));
  })).flat().sort((left, right) => left.candidacyId.localeCompare(right.candidacyId) || left.position - right.position);

  const csvById = new Map(csvRows.map((row) => [row.SQ_CANDIDATO, row]));
  const restById = new Map(restCandidates.map((candidate) => [candidate.id, candidate]));
  const allCandidateIds = [...new Set([...csvById.keys(), ...restById.keys()])];
  const proposalEntries = readZipEntries(proposalArchive.bytes)
    .filter((entry) => /^BR\/2026BR\d+_\d+\.pdf$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const csvGeneratedAt = parseTseGeneratedAt(csvRows[0]);
  const candidateLastModified = headerIso(candidateArchive.headers, "last-modified");
  const proposalLastModified = headerIso(proposalArchive.headers, "last-modified");
  const restDocumentPayloads = await mapWithConcurrency(restPlanDocumentMetadata, 3, async (metadata) => {
    const response = await fetchBytes(metadata.canonicalUrl);
    assertPdf(response.bytes, metadata.canonicalUrl);
    return {
      ...metadata,
      bytes: response.bytes,
      sha256: sha256(response.bytes),
      byteSize: response.bytes.length,
      lastModified: headerIso(response.headers, "last-modified"),
    };
  });
  const observedAt = maxIso(
    candidateLastModified,
    proposalLastModified,
    csvGeneratedAt,
    ...restDocumentPayloads.map((document) => document.lastModified),
  );
  const restPlanDocuments = restDocumentPayloads.map((document) => {
    const metadata = { ...document };
    delete metadata.bytes;
    return metadata;
  });
  const restDocumentsByCandidate = new Map();
  for (const document of restPlanDocuments) {
    const documents = restDocumentsByCandidate.get(document.candidacyId) ?? [];
    documents.push(document);
    restDocumentsByCandidate.set(document.candidacyId, documents);
  }

  const documentById = new Map();
  const zipHashesByCandidate = new Map();
  const zipDocumentHashesByCandidate = new Map();

  function addDocument({ candidacyId, officialFilename, canonicalUrl, bytes, capturedAt, source }) {
    assertPdf(bytes, canonicalUrl);
    const digest = sha256(bytes);
    const id = `doc-${candidacyId}-${digest.slice(0, 16)}`;
    let document = documentById.get(id);
    if (!document) {
      document = {
        id,
        candidacyId,
        officialFilename,
        mimeType: "application/pdf",
        canonicalUrl,
        capturedAt,
        sha256: digest,
        byteSize: bytes.length,
        pageCount: estimatedPdfPages(bytes),
        pageCountVerified: false,
        preservedObjectKey: `pdf/${digest}.pdf`,
        preservedPublicUrl: null,
        preservationStatus: "pending_upload",
        supersedesDocumentId: null,
        sources: [source],
      };
      documentById.set(id, document);
    } else {
      if (!document.sources.some((item) => item.kind === source.kind && item.documentId === source.documentId && item.archiveEntry === source.archiveEntry)) {
        document.sources.push(source);
      }
      if (source.kind === "divulgacand_rest") {
        document.officialFilename = officialFilename;
        document.canonicalUrl = canonicalUrl;
      }
      document.capturedAt = maxIso(document.capturedAt, capturedAt);
    }
    return document;
  }

  for (const entry of proposalEntries) {
    const match = /^BR\/2026BR(\d+)_(\d+)\.pdf$/i.exec(entry.name);
    const candidacyId = match[1];
    const digest = sha256(entry.data);
    const hashes = zipHashesByCandidate.get(candidacyId) ?? new Set();
    hashes.add(digest);
    zipHashesByCandidate.set(candidacyId, hashes);
    const documentHashes = zipDocumentHashesByCandidate.get(candidacyId) ?? [];
    documentHashes.push(digest);
    zipDocumentHashesByCandidate.set(candidacyId, documentHashes);
    addDocument({
      candidacyId,
      officialFilename: basename(entry.name),
      canonicalUrl: proposalResource.url,
      capturedAt: proposalLastModified ?? observedAt,
      bytes: entry.data,
      source: {
        kind: "ckan_zip",
        url: proposalResource.url,
        resourceId: String(proposalResource.id),
        documentId: null,
        archiveEntry: entry.name,
        observedAt: proposalLastModified ?? observedAt,
      },
    });
  }

  for (const restDocument of restDocumentPayloads) {
    addDocument({
      candidacyId: restDocument.candidacyId,
      officialFilename: restDocument.officialFilename,
      canonicalUrl: restDocument.canonicalUrl,
      capturedAt: restDocument.lastModified ?? observedAt,
      bytes: restDocument.bytes,
      source: {
        kind: "divulgacand_rest",
        url: restDocument.canonicalUrl,
        resourceId: null,
        documentId: restDocument.documentId,
        archiveEntry: null,
        observedAt: restDocument.lastModified ?? observedAt,
      },
    });
  }

  const documentRecords = [...documentById.values()];
  const documentsByCandidate = new Map();
  for (const document of documentRecords) {
    const ids = documentsByCandidate.get(document.candidacyId) ?? [];
    ids.push(document.id);
    documentsByCandidate.set(document.candidacyId, ids);
  }

  const csvOnlyCandidateIds = allCandidateIds.filter((id) => csvById.has(id) && !restById.has(id)).sort();
  const restOnlyCandidateIds = allCandidateIds.filter((id) => restById.has(id) && !csvById.has(id)).sort();
  const candidateMetadataMismatches = [];
  const candidates = allCandidateIds.map((id) => {
    const csv = csvById.get(id);
    const rest = restById.get(id);
    const planDocumentIds = (documentsByCandidate.get(id) ?? []).sort();
    const restDocuments = restDocumentsByCandidate.get(id) ?? [];
    const zipHashes = zipHashesByCandidate.get(id) ?? new Set();
    const candidateMetadata = csv && rest ? compareCandidateMetadata(csv, rest) : null;
    if (candidateMetadata && !candidateMetadata.matches) {
      candidateMetadataMismatches.push({ candidacyId: id, fields: candidateMetadata.mismatchedFields });
    }
    const zipDocumentHashes = zipDocumentHashesByCandidate.get(id) ?? [];
    const documentCorpus = compareDocumentCorpora(restDocuments, zipDocumentHashes);
    const reconciliationStatus = !csv
      ? "rest_only"
      : !rest
        ? "csv_only"
        : !candidateMetadata.matches
          ? "candidate_mismatch"
          : !documentCorpus.matches
            ? "document_mismatch"
            : restDocuments.length === 0 && zipDocumentHashes.length === 0
              ? "pending_documents"
              : "reconciled";
    const editorialStatus = reconciliationStatus === "document_mismatch" && zipHashes.size > 0
      ? "source_changed"
      : ["rest_only", "csv_only", "candidate_mismatch", "document_mismatch", "pending_documents"].includes(reconciliationStatus)
        ? "awaiting_consolidation"
        : "pending";
    return {
      id,
      sqCandidate: id,
      electionYear: 2026,
      ballotName: rest?.ballotName || csv?.NM_URNA_CANDIDATO || `Candidatura ${id}`,
      ballotNumber: rest?.ballotNumber || Number(csv?.NR_CANDIDATO),
      party: {
        acronym: rest?.partyAcronym || csv?.SG_PARTIDO || "Não informado",
        name: rest?.partyName || csv?.NM_PARTIDO || null,
      },
      office: "presidente",
      jurisdiction: "BR",
      officialStatus: {
        code: csv?.CD_SITUACAO_CANDIDATURA || "REST",
        label: rest?.officialStatus || csv?.DS_SITUACAO_CANDIDATURA || "Situação não informada",
        source: csv && rest ? "reconciled" : rest ? "divulgacand-rest" : "tse-csv",
        observedAt,
      },
      officialTotalizationStatus: {
        label: rest?.totalizationStatus || null,
        source: rest?.totalizationStatus ? "divulgacand-rest" : "unknown",
        observedAt,
      },
      editorialStatus,
      reconciliationStatus,
      sourceIds: {
        csvCandidateId: csv ? id : null,
        restCandidateId: rest ? id : null,
        csvElectionCode: csv?.CD_ELEICAO || null,
        restElectionId: rest?.restElectionId || null,
      },
      planDocumentIds,
      observedDocumentSha256s: [...new Set(planDocumentIds.map((documentId) => documentById.get(documentId)?.sha256).filter(Boolean))].sort(),
      observedDocumentCorpora: {
        zipSha256s: [...zipDocumentHashes],
        restSha256s: [...restDocuments].sort((left, right) => left.position - right.position).map((document) => document.sha256),
      },
      sourceObservedAt: observedAt,
      corpusObservedAt: observedAt,
      quality: {
        firstPassCompletedAt: null,
        secondPassCompletedAt: null,
        coldReviewCompletedAt: null,
        retestCompletedAt: null,
        readingHours: null,
      },
    };
  }).sort((left, right) => left.ballotName.localeCompare(right.ballotName, "pt-BR", { sensitivity: "base" }) || left.ballotNumber - right.ballotNumber);

  const source = {
    datasetId: String(ckan.value.result.id),
    datasetUrl: CKAN_DATASET,
    licenseId: "cc-by",
    ckanMetadataModifiedAt: new Date(ckan.value.result.metadata_modified).toISOString(),
    observedAt,
    csvGeneratedAt,
    resources: [
      {
        id: String(candidateResource.id),
        name: String(candidateResource.name),
        format: String(candidateResource.format),
        url: String(candidateResource.url),
        etag: candidateArchive.headers.get("etag"),
        lastModified: candidateLastModified,
        sha256: sha256(candidateArchive.bytes),
      },
      {
        id: String(proposalResource.id),
        name: String(proposalResource.name),
        format: String(proposalResource.format),
        url: String(proposalResource.url),
        etag: proposalArchive.headers.get("etag"),
        lastModified: proposalLastModified,
        sha256: sha256(proposalArchive.bytes),
      },
    ],
    rest: {
      url: REST_CANDIDATES,
      electionId: REST_ELECTION_ID,
      observedAt,
      candidateIds: [...restById.keys()].sort(),
      planDocuments: restPlanDocuments,
    },
    reconciliation: {
      csvOnlyCandidateIds,
      restOnlyCandidateIds,
      currentRestDocumentsMissingFromZip: restPlanDocuments
        .filter((document) => document.position === 0 && !(zipHashesByCandidate.get(document.candidacyId)?.has(document.sha256)))
        .map((document) => document.documentId)
        .sort(),
      restDocumentsMissingFromZip: [...restDocumentsByCandidate.entries()]
        .flatMap(([candidacyId, documents]) => restDocumentsMissingFromZip(documents, zipDocumentHashesByCandidate.get(candidacyId) ?? []))
        .map((document) => document.documentId)
        .sort(),
      zipDocumentsMissingFromRest: documentRecords
        .filter((document) => document.sources.some((sourceItem) => sourceItem.kind === "ckan_zip"))
        .filter((document) => !(restDocumentsByCandidate.get(document.candidacyId)?.some((restDocument) => restDocument.sha256 === document.sha256)))
        .map((document) => document.id)
        .sort(),
      candidateMetadataMismatches: candidateMetadataMismatches.sort((left, right) => left.candidacyId.localeCompare(right.candidacyId)),
    },
  };
  const sortedDocuments = documentRecords.sort((a, b) => a.id.localeCompare(b.id));
  const signature = semanticSyncSignature({ candidates, documents: sortedDocuments, source });
  return { candidates, documents: sortedDocuments, source: { ...source, syncSignature: signature, syncSignatureVersion: "semantic-v2" } };
}

export async function syncTseMetadata({ root = process.cwd(), check = false, cadence = "daily" } = {}) {
  const resolvedRoot = resolveRoot(root);
  if (!["hourly", "daily", "weekly"].includes(cadence)) throw new Error("cadence deve ser hourly, daily ou weekly");
  const collected = await collectTseMetadata();
  const sourcePath = join(resolvedRoot, "content/source/tse-2026.yaml");
  const existingSource = await maybeRead(sourcePath);
  let existingSignature = existingSource?.syncSignature;
  if (existingSource && existingSource.syncSignatureVersion !== "semantic-v2") {
    const [existingCandidates, existingDocuments] = await Promise.all([
      readMany(join(resolvedRoot, "content/candidaturas")),
      readMany(join(resolvedRoot, "content/documentos")),
    ]);
    existingSignature = semanticSyncSignature({ candidates: existingCandidates, documents: existingDocuments, source: existingSource });
  }
  const changed = existingSignature !== collected.source.syncSignature;
  if (check) return { changed, written: false, signature: collected.source.syncSignature };
  if (!changed) return { changed: false, written: false, signature: collected.source.syncSignature };

  const existingIds = await existingReleaseIds(resolvedRoot);
  const snapshotId = nextSnapshotId(existingIds, collected.source.observedAt);
  const [themes, existingCandidates, existingDocuments, coverageFiles, existingProposals] = await Promise.all([
    readYaml(join(resolvedRoot, "content/catalog/temas.yaml")),
    readMany(join(resolvedRoot, "content/candidaturas")),
    readMany(join(resolvedRoot, "content/documentos")),
    readMany(join(resolvedRoot, "content/cobertura")),
    readMany(join(resolvedRoot, "content/propostas")),
  ]);
  const merged = mergeEditorialMetadata({
    observedCandidates: collected.candidates,
    observedDocuments: collected.documents,
    existingCandidates,
    existingDocuments,
    existingFindings: coverageFiles.flat(),
    existingProposals,
    themes,
  });
  for (const candidate of merged.candidates) {
    await writeYaml(join(resolvedRoot, `content/candidaturas/${candidate.id}.yaml`), candidate);
    const findings = merged.findings.filter((finding) => finding.candidacyId === candidate.id);
    await writeYaml(join(resolvedRoot, `content/cobertura/${candidate.id}.yaml`), findings);
  }
  for (const document of merged.documents) await writeYaml(join(resolvedRoot, `content/documentos/${document.id}.yaml`), document);
  await writeYaml(sourcePath, { ...collected.source, cadence });
  const methodology = await readYaml(join(resolvedRoot, "content/releases/metodologia.yaml"));
  const sourceHasDivergence = Object.values(collected.source.reconciliation).some((identifiers) => identifiers.length > 0)
    || collected.candidates.some((candidate) => candidate.reconciliationStatus !== "reconciled")
    || merged.sourceChangedCandidateIds.length > 0;
  const release = {
    id: snapshotId,
    schemaVersion: "1.0.0",
    methodologyVersion: methodology.version,
    createdAt: collected.source.observedAt,
    sourceObservedAt: collected.source.observedAt,
    candidateIds: merged.candidates.map((candidate) => candidate.id),
    publishedCandidateIds: merged.candidates.filter((candidate) => candidate.editorialStatus === "published").map((candidate) => candidate.id),
    sourceStatus: sourceHasDivergence ? "divergent" : "stable",
    contentSha256: "pending",
    files: [],
  };
  await writeYaml(join(resolvedRoot, `content/releases/datasets/${snapshotId}.yaml`), release);
  await writeYaml(join(resolvedRoot, "content/releases/current.yaml"), release);
  return { changed: true, written: true, snapshotId, signature: collected.source.syncSignature };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const cadence = String(args.cadence ?? process.env.TSE_MONITOR_CADENCE ?? "daily");
  const result = await syncTseMetadata({ root: args.root, check: Boolean(args.check), cadence });
  if (args.check && result.changed) {
    console.error("TSE_CHANGED: a fonte oficial diverge do conteúdo versionado");
    process.exitCode = 2;
  } else {
    console.log(result.changed ? `TSE_UPDATED: snapshot ${result.snapshotId}` : "TSE_UNCHANGED: nenhuma alteração oficial detectada");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`TSE_SYNC_ERROR: ${error.message}`);
  process.exitCode = 1;
});

export { SAFE_CSV_FIELDS };
export { mergeEditorialMetadata };
export { compareCandidateMetadata, compareDocumentCorpora, restDocumentsMissingFromZip };
