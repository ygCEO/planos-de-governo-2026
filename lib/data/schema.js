const THEME_IDS = [
  "economia-impostos",
  "emprego-renda",
  "saude",
  "educacao",
  "seguranca-justica",
  "programas-sociais-habitacao",
  "meio-ambiente-clima",
  "infraestrutura-energia",
  "agricultura-agronegocio",
  "estado-instituicoes",
  "tecnologia-ciencia-inovacao",
  "politica-externa-defesa",
  "outros-temas",
];

const SECONDARY_TAG_IDS = [
  "cultura",
  "esporte",
  "direitos-humanos",
  "igualdade-racial",
  "povos-indigenas",
  "mulheres-genero",
  "diversidade-sexual-genero",
  "infancia-adolescencia",
  "pessoas-com-deficiencia",
  "pessoas-idosas",
];

const FINDING_STATUSES = ["proposals", "diagnosis_only", "not_found", "pending", "unverifiable"];
const EDITORIAL_STATUSES = [
  "pending",
  "awaiting_consolidation",
  "in_review",
  "ready",
  "published",
  "source_changed",
  "unverifiable",
];
const RECONCILIATION_STATUSES = [
  "reconciled",
  "csv_only",
  "rest_only",
  "pending_documents",
  "document_mismatch",
  "candidate_mismatch",
];
const TSE_DOCUMENT_HOSTS = Object.freeze({
  ckan_zip: "cdn.tse.jus.br",
  divulgacand_rest: "divulgacandcontas.tse.jus.br",
});
const PRESERVED_ROUTE_PREFIX = "/arquivos/";
const SENSITIVE_KEYS = new Set([
  "cpf",
  "nrcpf",
  "nrcpfcandidato",
  "tituloeleitor",
  "tituloeleitoral",
  "nrtituloeleitoral",
  "nrtituloeleitoralcandidato",
  "email",
  "nremail",
  "nmemail",
  "dsemail",
  "telefone",
  "nrtelefone",
  "nmtelefone",
  "dstelefone",
  "endereco",
  "nrendereco",
  "nmendereco",
  "dsendereco",
  "logradouro",
  "cep",
]);

export class DataValidationError extends Error {
  constructor(issues) {
    super(`Dados inválidos (${issues.length}):\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`);
    this.name = "DataValidationError";
    this.issues = issues;
  }
}

function normalizedKey(key) {
  return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function collectSensitiveKeys(value, path, issues) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveKeys(item, `${path}[${index}]`, issues));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizedKey(key))) {
      issues.push({ path: `${path}.${key}`, code: "sensitive_field", message: "campo sensível não pode ser persistido" });
    }
    collectSensitiveKeys(nested, `${path}.${key}`, issues);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredRecord(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ path, code: "record", message: "deve ser um objeto" });
    return false;
  }
  return true;
}

function requiredString(value, path, issues, options = {}) {
  if (typeof value !== "string" || (!options.empty && value.trim() === "")) {
    issues.push({ path, code: "string", message: "deve ser texto não vazio" });
    return false;
  }
  if (options.pattern && !options.pattern.test(value)) {
    issues.push({ path, code: "format", message: options.message ?? "formato inválido" });
    return false;
  }
  return true;
}

function nullableString(value, path, issues) {
  if (value !== null && typeof value !== "string") {
    issues.push({ path, code: "nullable_string", message: "deve ser texto ou null" });
    return false;
  }
  return true;
}

function requiredNumber(value, path, issues, options = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, code: "number", message: "deve ser número finito" });
    return false;
  }
  if (options.integer && !Number.isInteger(value)) {
    issues.push({ path, code: "integer", message: "deve ser inteiro" });
  }
  if (options.min !== undefined && value < options.min) {
    issues.push({ path, code: "minimum", message: `deve ser maior ou igual a ${options.min}` });
  }
  return true;
}

function requiredBoolean(value, path, issues) {
  if (typeof value !== "boolean") {
    issues.push({ path, code: "boolean", message: "deve ser booleano" });
    return false;
  }
  return true;
}

function requiredArray(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push({ path, code: "array", message: "deve ser uma lista" });
    return false;
  }
  return true;
}

function oneOf(value, allowed, path, issues) {
  if (!allowed.includes(value)) {
    issues.push({ path, code: "enum", message: `valor deve ser um de: ${allowed.join(", ")}` });
    return false;
  }
  return true;
}

function parseStrictHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isOfficialTseDocumentUrl(value, sourceKind = null) {
  const parsed = parseStrictHttpsUrl(value);
  if (!parsed) return false;
  const allowedHosts = sourceKind === null
    ? Object.values(TSE_DOCUMENT_HOSTS)
    : [TSE_DOCUMENT_HOSTS[sourceKind]].filter(Boolean);
  return allowedHosts.includes(parsed.hostname.toLowerCase());
}

function isAllowedPreservedHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "planos-de-governo-2026.pages.dev"
    || host.endsWith(".planos-de-governo-2026.pages.dev")
    || /^(?:[a-z0-9-]+-)?planos-de-governo-2026\.[a-z0-9-]+\.workers\.dev$/.test(host);
}

export function isAllowedPreservedPublicUrl(value, digest) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return false;
  const expectedPath = `${PRESERVED_ROUTE_PREFIX}${digest}`;
  if (value === expectedPath) return true;
  const parsed = parseStrictHttpsUrl(value);
  return Boolean(
    parsed
    && isAllowedPreservedHost(parsed.hostname)
    && parsed.pathname === expectedPath
    && parsed.search === ""
    && parsed.hash === "",
  );
}

function isoDateTime(value, path, issues, nullable = false) {
  if (nullable && value === null) return true;
  if (!requiredString(value, path, issues)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({ path, code: "datetime", message: "deve ser data e hora ISO 8601 em UTC" });
    return false;
  }
  return true;
}

function uniqueStrings(value, path, issues) {
  if (!requiredArray(value, path, issues)) return false;
  value.forEach((item, index) => requiredString(item, `${path}[${index}]`, issues));
  if (new Set(value).size !== value.length) {
    issues.push({ path, code: "unique", message: "não pode conter valores repetidos" });
  }
  return true;
}

function sameMultiset(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const counts = new Map();
  for (const value of left) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of right) {
    const remaining = counts.get(value) ?? 0;
    if (remaining === 0) return false;
    if (remaining === 1) counts.delete(value);
    else counts.set(value, remaining - 1);
  }
  return counts.size === 0;
}

function validateOccurrenceInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues);
  requiredString(value.documentId, `${path}.documentId`, issues);
  nullableString(value.section, `${path}.section`, issues);
  requiredNumber(value.physicalPage, `${path}.physicalPage`, issues, { integer: true, min: 1 });
  nullableString(value.printedPage, `${path}.printedPage`, issues);
  requiredString(value.quote, `${path}.quote`, issues);
  requiredBoolean(value.visualVerified, `${path}.visualVerified`, issues);
}

function validateCandidacyInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues);
  requiredString(value.sqCandidate, `${path}.sqCandidate`, issues, { pattern: /^\d+$/, message: "deve conter apenas dígitos" });
  if (value.id !== value.sqCandidate) issues.push({ path: `${path}.id`, code: "candidate_id", message: "deve ser igual a sqCandidate" });
  if (value.electionYear !== 2026) issues.push({ path: `${path}.electionYear`, code: "constant", message: "deve ser 2026" });
  requiredString(value.ballotName, `${path}.ballotName`, issues);
  requiredNumber(value.ballotNumber, `${path}.ballotNumber`, issues, { integer: true, min: 1 });
  if (requiredRecord(value.party, `${path}.party`, issues)) {
    requiredString(value.party.acronym, `${path}.party.acronym`, issues);
    nullableString(value.party.name, `${path}.party.name`, issues);
  }
  if (value.office !== "presidente") issues.push({ path: `${path}.office`, code: "constant", message: "deve ser presidente" });
  if (value.jurisdiction !== "BR") issues.push({ path: `${path}.jurisdiction`, code: "constant", message: "deve ser BR" });
  if (requiredRecord(value.officialStatus, `${path}.officialStatus`, issues)) {
    requiredString(value.officialStatus.code, `${path}.officialStatus.code`, issues);
    requiredString(value.officialStatus.label, `${path}.officialStatus.label`, issues);
    oneOf(value.officialStatus.source, ["tse-csv", "divulgacand-rest", "reconciled"], `${path}.officialStatus.source`, issues);
    isoDateTime(value.officialStatus.observedAt, `${path}.officialStatus.observedAt`, issues);
  }
  if (value.officialTotalizationStatus !== undefined && requiredRecord(value.officialTotalizationStatus, `${path}.officialTotalizationStatus`, issues)) {
    nullableString(value.officialTotalizationStatus.label, `${path}.officialTotalizationStatus.label`, issues);
    oneOf(value.officialTotalizationStatus.source, ["divulgacand-rest", "unknown"], `${path}.officialTotalizationStatus.source`, issues);
    isoDateTime(value.officialTotalizationStatus.observedAt, `${path}.officialTotalizationStatus.observedAt`, issues);
    if (value.officialTotalizationStatus.source === "unknown" && value.officialTotalizationStatus.label !== null) {
      issues.push({ path: `${path}.officialTotalizationStatus.label`, code: "totalization_source", message: "estado desconhecido deve usar label null" });
    }
  }
  oneOf(value.editorialStatus, EDITORIAL_STATUSES, `${path}.editorialStatus`, issues);
  oneOf(value.reconciliationStatus, RECONCILIATION_STATUSES, `${path}.reconciliationStatus`, issues);
  if (value.reconciliationStatus === "candidate_mismatch" && value.editorialStatus !== "awaiting_consolidation") {
    issues.push({ path: `${path}.editorialStatus`, code: "reconciliation_gate", message: "divergência cadastral deve aguardar consolidação" });
  }
  if (value.reconciliationStatus === "pending_documents" && value.editorialStatus !== "awaiting_consolidation") {
    issues.push({ path: `${path}.editorialStatus`, code: "reconciliation_gate", message: "candidatura sem corpus consolidado deve aguardar consolidação" });
  }
  if (requiredRecord(value.sourceIds, `${path}.sourceIds`, issues)) {
    nullableString(value.sourceIds.csvCandidateId, `${path}.sourceIds.csvCandidateId`, issues);
    nullableString(value.sourceIds.restCandidateId, `${path}.sourceIds.restCandidateId`, issues);
    nullableString(value.sourceIds.csvElectionCode, `${path}.sourceIds.csvElectionCode`, issues);
    nullableString(value.sourceIds.restElectionId, `${path}.sourceIds.restElectionId`, issues);
  }
  uniqueStrings(value.planDocumentIds, `${path}.planDocumentIds`, issues);
  if (value.observedDocumentSha256s !== undefined) {
    if (uniqueStrings(value.observedDocumentSha256s, `${path}.observedDocumentSha256s`, issues)) {
      value.observedDocumentSha256s.forEach((digest, index) => requiredString(digest, `${path}.observedDocumentSha256s[${index}]`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" }));
    }
  }
  if (value.observedDocumentCorpora !== undefined && requiredRecord(value.observedDocumentCorpora, `${path}.observedDocumentCorpora`, issues)) {
    for (const key of ["zipSha256s", "restSha256s"]) {
      if (requiredArray(value.observedDocumentCorpora[key], `${path}.observedDocumentCorpora.${key}`, issues)) {
        value.observedDocumentCorpora[key].forEach((digest, index) => requiredString(digest, `${path}.observedDocumentCorpora.${key}[${index}]`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" }));
      }
    }
  }
  isoDateTime(value.sourceObservedAt, `${path}.sourceObservedAt`, issues);
  if (value.corpusObservedAt !== undefined) isoDateTime(value.corpusObservedAt, `${path}.corpusObservedAt`, issues);
  if (requiredRecord(value.quality, `${path}.quality`, issues)) {
    for (const key of ["firstPassCompletedAt", "secondPassCompletedAt", "coldReviewCompletedAt", "retestCompletedAt"]) {
      isoDateTime(value.quality[key], `${path}.quality.${key}`, issues, true);
    }
    if (value.quality.readingHours !== null) requiredNumber(value.quality.readingHours, `${path}.quality.readingHours`, issues, { min: 0 });
  }
}

function validateDocumentInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues);
  requiredString(value.candidacyId, `${path}.candidacyId`, issues);
  requiredString(value.officialFilename, `${path}.officialFilename`, issues);
  if (value.mimeType !== "application/pdf") issues.push({ path: `${path}.mimeType`, code: "constant", message: "deve ser application/pdf" });
  if (requiredString(value.canonicalUrl, `${path}.canonicalUrl`, issues) && !isOfficialTseDocumentUrl(value.canonicalUrl)) {
    issues.push({ path: `${path}.canonicalUrl`, code: "official_url", message: "deve usar um host oficial previsto do TSE" });
  }
  isoDateTime(value.capturedAt, `${path}.capturedAt`, issues);
  requiredString(value.sha256, `${path}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
  requiredNumber(value.byteSize, `${path}.byteSize`, issues, { integer: true, min: 1 });
  if (value.pageCount !== null) requiredNumber(value.pageCount, `${path}.pageCount`, issues, { integer: true, min: 1 });
  requiredBoolean(value.pageCountVerified, `${path}.pageCountVerified`, issues);
  if (requiredString(value.preservedObjectKey, `${path}.preservedObjectKey`, issues) && typeof value.sha256 === "string" && value.preservedObjectKey !== `pdf/${value.sha256}.pdf`) {
    issues.push({ path: `${path}.preservedObjectKey`, code: "preserved_key", message: "deve ser exatamente pdf/<sha256>.pdf" });
  }
  if (nullableString(value.preservedPublicUrl, `${path}.preservedPublicUrl`, issues) && !isAllowedPreservedPublicUrl(value.preservedPublicUrl, value.sha256)) {
    issues.push({ path: `${path}.preservedPublicUrl`, code: "preserved_url", message: "deve usar /arquivos/<sha256> ou a mesma rota em host HTTPS permitido" });
  }
  oneOf(value.preservationStatus, ["pending_upload", "preserved", "failed"], `${path}.preservationStatus`, issues);
  nullableString(value.supersedesDocumentId, `${path}.supersedesDocumentId`, issues);
  if (requiredArray(value.sources, `${path}.sources`, issues)) {
    if (value.sources.length === 0) issues.push({ path: `${path}.sources`, code: "minimum", message: "deve ter ao menos uma fonte" });
    value.sources.forEach((source, index) => {
      const sourcePath = `${path}.sources[${index}]`;
      if (!requiredRecord(source, sourcePath, issues)) return;
      oneOf(source.kind, ["ckan_zip", "divulgacand_rest"], `${sourcePath}.kind`, issues);
      if (requiredString(source.url, `${sourcePath}.url`, issues) && !isOfficialTseDocumentUrl(source.url, source.kind)) {
        issues.push({ path: `${sourcePath}.url`, code: "official_url", message: "fonte deve usar o host oficial do TSE correspondente ao tipo" });
      }
      nullableString(source.resourceId, `${sourcePath}.resourceId`, issues);
      nullableString(source.documentId, `${sourcePath}.documentId`, issues);
      nullableString(source.archiveEntry, `${sourcePath}.archiveEntry`, issues);
      isoDateTime(source.observedAt, `${sourcePath}.observedAt`, issues);
    });
  }
}

function validateFindingInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.candidacyId, `${path}.candidacyId`, issues);
  oneOf(value.themeId, THEME_IDS, `${path}.themeId`, issues);
  oneOf(value.status, FINDING_STATUSES, `${path}.status`, issues);
  uniqueStrings(value.proposalIds, `${path}.proposalIds`, issues);
  if (requiredArray(value.evidence, `${path}.evidence`, issues)) {
    value.evidence.forEach((occurrence, index) => validateOccurrenceInto(occurrence, `${path}.evidence[${index}]`, issues));
  }
  isoDateTime(value.reviewedAt, `${path}.reviewedAt`, issues, true);
  nullableString(value.note, `${path}.note`, issues);
  if (value.status === "proposals" && Array.isArray(value.proposalIds) && value.proposalIds.length === 0) {
    issues.push({ path: `${path}.proposalIds`, code: "finding_evidence", message: "estado proposals exige ao menos uma proposta" });
  }
  if (value.status !== "proposals" && Array.isArray(value.proposalIds) && value.proposalIds.length > 0) {
    issues.push({ path: `${path}.proposalIds`, code: "finding_conflict", message: "somente o estado proposals pode referenciar propostas" });
  }
  if (value.status === "diagnosis_only" && Array.isArray(value.evidence) && value.evidence.length === 0) {
    issues.push({ path: `${path}.evidence`, code: "finding_evidence", message: "estado diagnosis_only exige citação e página" });
  }
  if (value.status === "diagnosis_only" && Array.isArray(value.evidence) && value.evidence.some((occurrence) => occurrence.visualVerified !== true)) {
    issues.push({ path: `${path}.evidence`, code: "visual_verification", message: "diagnóstico exige evidência conferida visualmente" });
  }
  if (["not_found", "unverifiable"].includes(value.status) && value.reviewedAt === null) {
    issues.push({ path: `${path}.reviewedAt`, code: "review_required", message: `estado ${value.status} exige revisão registrada` });
  }
  if (value.status === "unverifiable" && (typeof value.note !== "string" || value.note.trim() === "")) {
    issues.push({ path: `${path}.note`, code: "unverifiable_reason", message: "estado unverifiable exige impedimento documentado" });
  }
}

function validateProposalInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues);
  requiredString(value.candidacyId, `${path}.candidacyId`, issues);
  requiredString(value.canonicalOccurrenceId, `${path}.canonicalOccurrenceId`, issues);
  if (requiredArray(value.occurrences, `${path}.occurrences`, issues)) {
    if (value.occurrences.length === 0) issues.push({ path: `${path}.occurrences`, code: "minimum", message: "deve ter ao menos uma ocorrência" });
    value.occurrences.forEach((occurrence, index) => validateOccurrenceInto(occurrence, `${path}.occurrences[${index}]`, issues));
  }
  requiredString(value.quoteShort, `${path}.quoteShort`, issues);
  requiredString(value.quoteFull, `${path}.quoteFull`, issues);
  if (typeof value.quoteShort === "string" && value.quoteShort.length > 550) {
    issues.push({ path: `${path}.quoteShort`, code: "quote_length", message: "citação curta deve ter no máximo 550 caracteres" });
  }
  oneOf(value.primaryThemeId, THEME_IDS, `${path}.primaryThemeId`, issues);
  if (uniqueStrings(value.secondaryTagIds, `${path}.secondaryTagIds`, issues)) {
    value.secondaryTagIds.forEach((tag, index) => oneOf(tag, SECONDARY_TAG_IDS, `${path}.secondaryTagIds[${index}]`, issues));
  }
  requiredNumber(value.documentOrder, `${path}.documentOrder`, issues, { integer: true, min: 1 });
  if (requiredRecord(value.criteria, `${path}.criteria`, issues)) {
    requiredBoolean(value.criteria.a1ActionCommitment, `${path}.criteria.a1ActionCommitment`, issues);
    requiredBoolean(value.criteria.a2IdentifiableObject, `${path}.criteria.a2IdentifiableObject`, issues);
    requiredBoolean(value.criteria.a3FederalExecutiveAgent, `${path}.criteria.a3FederalExecutiveAgent`, issues);
    requiredString(value.criteria.rationale, `${path}.criteria.rationale`, issues);
    if ([value.criteria.a1ActionCommitment, value.criteria.a2IdentifiableObject, value.criteria.a3FederalExecutiveAgent].some((item) => item !== true)) {
      issues.push({ path: `${path}.criteria`, code: "criteria", message: "proposta publicada deve satisfazer A1, A2 e A3" });
    }
  }
  isoDateTime(value.codedAt, `${path}.codedAt`, issues);
  isoDateTime(value.coldReviewedAt, `${path}.coldReviewedAt`, issues);
  requiredString(value.sourceDocumentSha256, `${path}.sourceDocumentSha256`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
}

function isLiteralMarkedExcerpt(excerpt, fullQuote) {
  if (excerpt === fullQuote) return true;
  if (!excerpt.includes("[...]")) return false;
  const fragments = excerpt.split("[...]").map((fragment) => fragment.trim()).filter(Boolean);
  if (fragments.length === 0) return false;
  let cursor = 0;
  for (const fragment of fragments) {
    const index = fullQuote.indexOf(fragment, cursor);
    if (index < 0) return false;
    cursor = index + fragment.length;
  }
  return true;
}

function validateMethodologyInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.version, `${path}.version`, issues);
  oneOf(value.status, ["draft", "frozen", "superseded"], `${path}.status`, issues);
  isoDateTime(value.releasedAt, `${path}.releasedAt`, issues);
  requiredString(value.sourcePath, `${path}.sourcePath`, issues);
  nullableString(value.commit, `${path}.commit`, issues);
  uniqueStrings(value.changelog, `${path}.changelog`, issues);
}

function validateReleaseInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues, { pattern: /^\d{4}-\d{2}-\d{2}\.\d+$/, message: "deve seguir AAAA-MM-DD.N" });
  if (value.schemaVersion !== "1.0.0") issues.push({ path: `${path}.schemaVersion`, code: "constant", message: "deve ser 1.0.0" });
  requiredString(value.methodologyVersion, `${path}.methodologyVersion`, issues);
  isoDateTime(value.createdAt, `${path}.createdAt`, issues);
  isoDateTime(value.sourceObservedAt, `${path}.sourceObservedAt`, issues);
  uniqueStrings(value.candidateIds, `${path}.candidateIds`, issues);
  uniqueStrings(value.publishedCandidateIds, `${path}.publishedCandidateIds`, issues);
  oneOf(value.sourceStatus, ["stable", "divergent"], `${path}.sourceStatus`, issues);
  requiredString(value.contentSha256, `${path}.contentSha256`, issues, { pattern: /^(?:pending|[a-f0-9]{64})$/, message: "deve ser pending ou SHA-256" });
  if (requiredArray(value.files, `${path}.files`, issues)) {
    value.files.forEach((file, index) => {
      const filePath = `${path}.files[${index}]`;
      if (!requiredRecord(file, filePath, issues)) return;
      requiredString(file.path, `${filePath}.path`, issues);
      requiredString(file.sha256, `${filePath}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
      requiredNumber(file.byteSize, `${filePath}.byteSize`, issues, { integer: true, min: 1 });
    });
  }
}

function validateTseSourceInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  if (value.cadence !== undefined) oneOf(value.cadence, ["hourly", "daily", "weekly"], `${path}.cadence`, issues);
  if (value.syncSignature !== undefined) requiredString(value.syncSignature, `${path}.syncSignature`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
  if (value.syncSignatureVersion !== undefined && value.syncSignatureVersion !== "semantic-v2") issues.push({ path: `${path}.syncSignatureVersion`, code: "constant", message: "deve ser semantic-v2" });
  requiredString(value.datasetId, `${path}.datasetId`, issues);
  requiredString(value.datasetUrl, `${path}.datasetUrl`, issues, { pattern: /^https:\/\/dadosabertos\.tse\.jus\.br\//, message: "deve apontar para o Portal de Dados Abertos do TSE" });
  if (value.licenseId !== "cc-by") issues.push({ path: `${path}.licenseId`, code: "constant", message: "deve ser cc-by" });
  isoDateTime(value.ckanMetadataModifiedAt, `${path}.ckanMetadataModifiedAt`, issues);
  isoDateTime(value.observedAt, `${path}.observedAt`, issues);
  isoDateTime(value.csvGeneratedAt, `${path}.csvGeneratedAt`, issues, true);
  if (requiredArray(value.resources, `${path}.resources`, issues)) {
    value.resources.forEach((resource, index) => {
      const resourcePath = `${path}.resources[${index}]`;
      if (!requiredRecord(resource, resourcePath, issues)) return;
      requiredString(resource.id, `${resourcePath}.id`, issues);
      requiredString(resource.name, `${resourcePath}.name`, issues);
      requiredString(resource.format, `${resourcePath}.format`, issues);
      if (requiredString(resource.url, `${resourcePath}.url`, issues) && !isOfficialTseDocumentUrl(resource.url, "ckan_zip")) {
        issues.push({ path: `${resourcePath}.url`, code: "official_url", message: "deve apontar para o CDN oficial do TSE" });
      }
      nullableString(resource.etag, `${resourcePath}.etag`, issues);
      isoDateTime(resource.lastModified, `${resourcePath}.lastModified`, issues, true);
      requiredString(resource.sha256, `${resourcePath}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
    });
  }
  if (requiredRecord(value.rest, `${path}.rest`, issues)) {
    if (requiredString(value.rest.url, `${path}.rest.url`, issues) && !isOfficialTseDocumentUrl(value.rest.url, "divulgacand_rest")) {
      issues.push({ path: `${path}.rest.url`, code: "official_url", message: "deve apontar para o DivulgaCandContas" });
    }
    requiredString(value.rest.electionId, `${path}.rest.electionId`, issues, { pattern: /^\d+$/, message: "deve conter apenas dígitos" });
    isoDateTime(value.rest.observedAt, `${path}.rest.observedAt`, issues);
    uniqueStrings(value.rest.candidateIds, `${path}.rest.candidateIds`, issues);
    if (requiredArray(value.rest.planDocuments, `${path}.rest.planDocuments`, issues)) {
      value.rest.planDocuments.forEach((document, index) => {
        const documentPath = `${path}.rest.planDocuments[${index}]`;
        if (!requiredRecord(document, documentPath, issues)) return;
        requiredString(document.candidacyId, `${documentPath}.candidacyId`, issues);
        requiredString(document.documentId, `${documentPath}.documentId`, issues);
        requiredString(document.officialFilename, `${documentPath}.officialFilename`, issues);
        if (requiredString(document.canonicalUrl, `${documentPath}.canonicalUrl`, issues) && !isOfficialTseDocumentUrl(document.canonicalUrl, "divulgacand_rest")) {
          issues.push({ path: `${documentPath}.canonicalUrl`, code: "official_url", message: "deve apontar para o DivulgaCandContas" });
        }
        requiredNumber(document.position, `${documentPath}.position`, issues, { integer: true, min: 0 });
        requiredString(document.sha256, `${documentPath}.sha256`, issues, { pattern: /^[a-f0-9]{64}$/, message: "deve ser SHA-256 hexadecimal" });
        requiredNumber(document.byteSize, `${documentPath}.byteSize`, issues, { integer: true, min: 1 });
        isoDateTime(document.lastModified, `${documentPath}.lastModified`, issues, true);
      });
    }
  }
  if (requiredRecord(value.reconciliation, `${path}.reconciliation`, issues)) {
    for (const key of ["csvOnlyCandidateIds", "restOnlyCandidateIds", "currentRestDocumentsMissingFromZip", "zipDocumentsMissingFromRest"]) {
      uniqueStrings(value.reconciliation[key], `${path}.reconciliation.${key}`, issues);
    }
    if (value.reconciliation.restDocumentsMissingFromZip !== undefined) {
      uniqueStrings(value.reconciliation.restDocumentsMissingFromZip, `${path}.reconciliation.restDocumentsMissingFromZip`, issues);
    }
    if (value.reconciliation.candidateMetadataMismatches !== undefined && requiredArray(value.reconciliation.candidateMetadataMismatches, `${path}.reconciliation.candidateMetadataMismatches`, issues)) {
      value.reconciliation.candidateMetadataMismatches.forEach((mismatch, index) => {
        const mismatchPath = `${path}.reconciliation.candidateMetadataMismatches[${index}]`;
        if (!requiredRecord(mismatch, mismatchPath, issues)) return;
        requiredString(mismatch.candidacyId, `${mismatchPath}.candidacyId`, issues);
        if (uniqueStrings(mismatch.fields, `${mismatchPath}.fields`, issues)) {
          mismatch.fields.forEach((field, fieldIndex) => oneOf(field, ["ballotName", "ballotNumber", "partyAcronym", "officialStatus"], `${mismatchPath}.fields[${fieldIndex}]`, issues));
          if (mismatch.fields.length === 0) issues.push({ path: `${mismatchPath}.fields`, code: "minimum", message: "deve registrar ao menos um campo divergente" });
        }
      });
    }
  }
}

function validateDecisionInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  requiredString(value.id, `${path}.id`, issues);
  requiredString(value.candidacyId, `${path}.candidacyId`, issues);
  nullableString(value.proposalId, `${path}.proposalId`, issues);
  oneOf(value.type, ["inclusion", "exclusion", "segmentation", "deduplication", "classification"], `${path}.type`, issues);
  oneOf(value.rule, ["A1", "A2", "A3", "boundary", "duplicate", "segmentation"], `${path}.rule`, issues);
  requiredString(value.rationale, `${path}.rationale`, issues);
  isoDateTime(value.decidedAt, `${path}.decidedAt`, issues);
  isoDateTime(value.coldReviewedAt, `${path}.coldReviewedAt`, issues, true);
  requiredString(value.reviewer, `${path}.reviewer`, issues);
}

function schema(name, validateInto) {
  return Object.freeze({
    parse(value) {
      const issues = [];
      collectSensitiveKeys(value, name, issues);
      validateInto(value, name, issues);
      if (issues.length) throw new DataValidationError(issues);
      return value;
    },
    safeParse(value) {
      try {
        return { success: true, data: this.parse(value) };
      } catch (error) {
        return { success: false, error };
      }
    },
  });
}

export const candidacySchema = schema("candidacy", validateCandidacyInto);
export const planDocumentVersionSchema = schema("document", validateDocumentInto);
export const sourceOccurrenceSchema = schema("occurrence", validateOccurrenceInto);
export const proposalSchema = schema("proposal", validateProposalInto);
export const candidateThemeFindingSchema = schema("finding", validateFindingInto);
export const methodologyReleaseSchema = schema("methodology", validateMethodologyInto);
export const datasetReleaseSchema = schema("release", validateReleaseInto);
export const codingDecisionSchema = schema("decision", validateDecisionInto);

function validateDatasetInto(value, path, issues) {
  if (!requiredRecord(value, path, issues)) return;
  if (value.schemaVersion !== "1.0.0") issues.push({ path: `${path}.schemaVersion`, code: "constant", message: "deve ser 1.0.0" });
  validateReleaseInto(value.release, `${path}.release`, issues);
  validateMethodologyInto(value.methodology, `${path}.methodology`, issues);
  validateTseSourceInto(value.source, `${path}.source`, issues);
  if (isRecord(value.release) && isRecord(value.methodology)) {
    if (value.release.methodologyVersion !== value.methodology.version) {
      issues.push({ path: `${path}.release.methodologyVersion`, code: "methodology_version", message: "deve coincidir com a metodologia incluída no snapshot" });
    }
    if (value.methodology.status !== "frozen") {
      issues.push({ path: `${path}.methodology.status`, code: "methodology_gate", message: "snapshot público exige metodologia congelada" });
    }
    if (typeof value.methodology.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.methodology.commit)) {
      issues.push({ path: `${path}.methodology.commit`, code: "methodology_gate", message: "snapshot público exige commit completo da metodologia congelada" });
    }
  }
  if (isRecord(value.release) && isRecord(value.source) && value.release.sourceObservedAt !== value.source.observedAt) {
    issues.push({ path: `${path}.release.sourceObservedAt`, code: "source_version", message: "deve coincidir com a observação TSE incluída no snapshot" });
  }

  if (requiredArray(value.themes, `${path}.themes`, issues)) {
    if (value.themes.length !== 13) issues.push({ path: `${path}.themes`, code: "theme_count", message: "deve conter exatamente 13 temas" });
    value.themes.forEach((theme, index) => {
      const themePath = `${path}.themes[${index}]`;
      if (!requiredRecord(theme, themePath, issues)) return;
      oneOf(theme.id, THEME_IDS, `${themePath}.id`, issues);
      requiredNumber(theme.order, `${themePath}.order`, issues, { integer: true, min: 1 });
      requiredString(theme.title, `${themePath}.title`, issues);
      requiredString(theme.shortTitle, `${themePath}.shortTitle`, issues);
      requiredString(theme.scope, `${themePath}.scope`, issues);
      uniqueStrings(theme.boundaryExamples, `${themePath}.boundaryExamples`, issues);
      requiredBoolean(theme.residual, `${themePath}.residual`, issues);
    });
    const ids = value.themes.map((theme) => theme?.id);
    if (new Set(ids).size !== 13 || THEME_IDS.some((id) => !ids.includes(id))) {
      issues.push({ path: `${path}.themes`, code: "theme_catalog", message: "catálogo deve conter cada tema fixo exatamente uma vez" });
    }
  }

  if (requiredArray(value.secondaryTags, `${path}.secondaryTags`, issues)) {
    value.secondaryTags.forEach((tag, index) => {
      const tagPath = `${path}.secondaryTags[${index}]`;
      if (!requiredRecord(tag, tagPath, issues)) return;
      oneOf(tag.id, SECONDARY_TAG_IDS, `${tagPath}.id`, issues);
      requiredString(tag.title, `${tagPath}.title`, issues);
      requiredString(tag.description, `${tagPath}.description`, issues);
    });
    const ids = value.secondaryTags.map((tag) => tag?.id);
    if (new Set(ids).size !== SECONDARY_TAG_IDS.length || SECONDARY_TAG_IDS.some((id) => !ids.includes(id))) {
      issues.push({ path: `${path}.secondaryTags`, code: "tag_catalog", message: "catálogo deve conter cada etiqueta fixa exatamente uma vez" });
    }
  }

  const candidacies = Array.isArray(value.candidacies) ? value.candidacies : [];
  const documents = Array.isArray(value.documents) ? value.documents : [];
  const findings = Array.isArray(value.findings) ? value.findings : [];
  const proposals = Array.isArray(value.proposals) ? value.proposals : [];
  const decisions = Array.isArray(value.codingDecisions) ? value.codingDecisions : [];
  requiredArray(value.candidacies, `${path}.candidacies`, issues);
  requiredArray(value.documents, `${path}.documents`, issues);
  requiredArray(value.findings, `${path}.findings`, issues);
  requiredArray(value.proposals, `${path}.proposals`, issues);
  requiredArray(value.codingDecisions, `${path}.codingDecisions`, issues);
  candidacies.forEach((item, index) => validateCandidacyInto(item, `${path}.candidacies[${index}]`, issues));
  documents.forEach((item, index) => validateDocumentInto(item, `${path}.documents[${index}]`, issues));
  findings.forEach((item, index) => validateFindingInto(item, `${path}.findings[${index}]`, issues));
  proposals.forEach((item, index) => validateProposalInto(item, `${path}.proposals[${index}]`, issues));
  decisions.forEach((item, index) => validateDecisionInto(item, `${path}.codingDecisions[${index}]`, issues));

  const byCandidate = new Map(candidacies.map((candidate) => [candidate.id, candidate]));
  const byDocument = new Map(documents.map((document) => [document.id, document]));
  const byProposal = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const metadataMismatches = value.source?.reconciliation?.candidateMetadataMismatches;
  if (Array.isArray(metadataMismatches)) {
    const mismatchIds = new Set(metadataMismatches.map((mismatch) => mismatch.candidacyId));
    for (const mismatch of metadataMismatches) {
      const candidate = byCandidate.get(mismatch.candidacyId);
      if (!candidate || candidate.reconciliationStatus !== "candidate_mismatch" || candidate.editorialStatus !== "awaiting_consolidation") {
        issues.push({ path: `${path}.source.reconciliation.candidateMetadataMismatches`, code: "reconciliation_gate", message: `candidatura ${mismatch.candidacyId} divergente deve usar candidate_mismatch e aguardar consolidação` });
      }
    }
    for (const candidate of candidacies.filter((item) => item.reconciliationStatus === "candidate_mismatch")) {
      if (!mismatchIds.has(candidate.id)) issues.push({ path: `${path}.candidacies.${candidate.id}.reconciliationStatus`, code: "reconciliation_gate", message: "divergência cadastral deve constar da reconciliação da fonte" });
    }
  }
  for (const [label, entries] of [["candidacies", candidacies], ["documents", documents], ["proposals", proposals], ["codingDecisions", decisions]]) {
    const ids = entries.map((entry) => entry?.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) issues.push({ path: `${path}.${label}`, code: "duplicate_id", message: "IDs devem ser únicos" });
  }

  for (const document of documents) {
    if (!byCandidate.has(document.candidacyId)) issues.push({ path: `${path}.documents.${document.id}`, code: "reference", message: "candidatura inexistente" });
    if (document.supersedesDocumentId && !byDocument.has(document.supersedesDocumentId)) issues.push({ path: `${path}.documents.${document.id}.supersedesDocumentId`, code: "reference", message: "documento substituído inexistente" });
  }

  for (const candidate of candidacies) {
    const candidateFindings = findings.filter((finding) => finding.candidacyId === candidate.id);
    const findingThemes = candidateFindings.map((finding) => finding.themeId);
    if (candidateFindings.length !== 13 || new Set(findingThemes).size !== 13 || THEME_IDS.some((id) => !findingThemes.includes(id))) {
      issues.push({ path: `${path}.candidacies.${candidate.id}`, code: "coverage", message: "candidatura deve ter exatamente um registro para cada um dos 13 temas" });
    }
    for (const documentId of candidate.planDocumentIds) {
      const document = byDocument.get(documentId);
      if (!document || document.candidacyId !== candidate.id) issues.push({ path: `${path}.candidacies.${candidate.id}.planDocumentIds`, code: "reference", message: `documento ${documentId} inexistente ou de outra candidatura` });
    }
    if (candidate.editorialStatus === "published") {
      if (candidate.planDocumentIds.length === 0) issues.push({ path: `${path}.candidacies.${candidate.id}.planDocumentIds`, code: "publication_gate", message: "publicação exige ao menos um documento oficial" });
      if (candidate.reconciliationStatus !== "reconciled") issues.push({ path: `${path}.candidacies.${candidate.id}.reconciliationStatus`, code: "publication_gate", message: "publicação exige fontes reconciliadas" });
      if (candidate.sourceIds?.csvCandidateId !== candidate.id || candidate.sourceIds?.restCandidateId !== candidate.id) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.sourceIds`, code: "reconciliation_gate", message: "publicação exige a mesma candidatura identificada no CSV e no REST" });
      }
      if (candidate.officialStatus?.source !== "reconciled") {
        issues.push({ path: `${path}.candidacies.${candidate.id}.officialStatus.source`, code: "reconciliation_gate", message: "publicação exige situação oficial reconciliada entre CSV e REST" });
      }
      if (candidateFindings.some((finding) => finding.status === "pending")) issues.push({ path: `${path}.candidacies.${candidate.id}`, code: "publication_gate", message: "publicação exige os 13 temas fechados" });
      const sourceObservedAt = Date.parse(candidate.corpusObservedAt ?? candidate.sourceObservedAt);
      const currentCorpusHashes = new Set(candidate.observedDocumentSha256s ?? []);
      const observedCorpora = candidate.observedDocumentCorpora;
      if (!observedCorpora || !Array.isArray(observedCorpora.zipSha256s) || !Array.isArray(observedCorpora.restSha256s) || observedCorpora.zipSha256s.length === 0 || observedCorpora.restSha256s.length === 0) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.observedDocumentCorpora`, code: "source_corpus", message: "publicação exige corpora observados não vazios do ZIP e do REST" });
      } else {
        if (!sameMultiset(observedCorpora.zipSha256s, observedCorpora.restSha256s)) {
          issues.push({ path: `${path}.candidacies.${candidate.id}.observedDocumentCorpora`, code: "source_corpus", message: "publicação exige igualdade integral entre os corpora ZIP e REST" });
        }
        const corpusHashes = new Set([...observedCorpora.zipSha256s, ...observedCorpora.restSha256s]);
        if (corpusHashes.size !== currentCorpusHashes.size || [...corpusHashes].some((digest) => !currentCorpusHashes.has(digest))) {
          issues.push({ path: `${path}.candidacies.${candidate.id}.observedDocumentSha256s`, code: "source_corpus", message: "hashes atuais devem corresponder exatamente aos corpora reconciliados" });
        }
      }
      if (currentCorpusHashes.size === 0) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.observedDocumentSha256s`, code: "source_version", message: "publicação exige corpus observado atual identificado por hash" });
      }
      for (const digest of currentCorpusHashes) {
        const currentDocument = documents.find((document) => document.candidacyId === candidate.id && document.sha256 === digest);
        if (!currentDocument) issues.push({ path: `${path}.candidacies.${candidate.id}.observedDocumentSha256s`, code: "source_version", message: `hash atual ${digest} não corresponde a documento da candidatura` });
      }
      const coldReview = candidate.quality?.coldReviewCompletedAt;
      const secondPass = candidate.quality?.secondPassCompletedAt;
      const firstPass = candidate.quality?.firstPassCompletedAt;
      if (!firstPass || !secondPass || Date.parse(secondPass) < Date.parse(firstPass)) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.quality`, code: "reading_protocol", message: "publicação exige primeira e segunda leituras em ordem cronológica" });
      }
      if (typeof candidate.quality?.readingHours !== "number" || candidate.quality.readingHours <= 0) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.quality.readingHours`, code: "reading_protocol", message: "publicação exige horas de leitura registradas" });
      }
      if (!coldReview || !secondPass || Date.parse(coldReview) - Date.parse(secondPass) < 48 * 60 * 60 * 1000) {
        issues.push({ path: `${path}.candidacies.${candidate.id}.quality`, code: "cold_review", message: "publicação exige revisão fria ao menos 48 horas após a segunda leitura" });
      }
      for (const [label, timestamp] of [["firstPassCompletedAt", firstPass], ["secondPassCompletedAt", secondPass], ["coldReviewCompletedAt", coldReview]]) {
        if (!timestamp || Date.parse(timestamp) < sourceObservedAt) {
          issues.push({ path: `${path}.candidacies.${candidate.id}.quality.${label}`, code: "source_version", message: "leitura e revisão devem estar vinculadas ao corpus observado atual" });
        }
      }
      for (const finding of candidateFindings) {
        if (!finding.reviewedAt || Date.parse(finding.reviewedAt) < sourceObservedAt) {
          issues.push({ path: `${path}.findings.${candidate.id}.${finding.themeId}.reviewedAt`, code: "source_version", message: "fechamento temático deve ser posterior à observação do corpus atual" });
        }
        for (const occurrence of finding.evidence) {
          const document = byDocument.get(occurrence.documentId);
          if (!document || !currentCorpusHashes.has(document.sha256)) {
            issues.push({ path: `${path}.findings.${candidate.id}.${finding.themeId}.evidence`, code: "source_version", message: "evidência temática deve apontar para o corpus observado atual" });
          }
        }
      }
      for (const proposal of proposals.filter((item) => item.candidacyId === candidate.id)) {
        if (!currentCorpusHashes.has(proposal.sourceDocumentSha256)) {
          issues.push({ path: `${path}.proposals.${proposal.id}.sourceDocumentSha256`, code: "source_version", message: "proposta deve apontar para o corpus observado atual" });
        }
        if (Date.parse(proposal.codedAt) < sourceObservedAt || Date.parse(proposal.coldReviewedAt) < sourceObservedAt) {
          issues.push({ path: `${path}.proposals.${proposal.id}`, code: "source_version", message: "codificação e revisão devem ser posteriores à observação do corpus atual" });
        }
        for (const occurrence of proposal.occurrences) {
          const document = byDocument.get(occurrence.documentId);
          if (!document || !currentCorpusHashes.has(document.sha256)) {
            issues.push({ path: `${path}.proposals.${proposal.id}.occurrences`, code: "source_version", message: "toda ocorrência deve apontar para o corpus observado atual" });
          }
        }
      }
      for (const decision of decisions.filter((item) => item.candidacyId === candidate.id)) {
        if (Date.parse(decision.decidedAt) < sourceObservedAt || (decision.coldReviewedAt && Date.parse(decision.coldReviewedAt) < sourceObservedAt)) {
          issues.push({ path: `${path}.codingDecisions.${decision.id}`, code: "source_version", message: "decisão editorial deve estar vinculada ao corpus observado atual" });
        }
      }
      for (const documentId of candidate.planDocumentIds) {
        const document = byDocument.get(documentId);
        if (!document || document.pageCount === null || !document.pageCountVerified || document.preservationStatus !== "preserved" || !document.preservedPublicUrl) {
          issues.push({ path: `${path}.candidacies.${candidate.id}.planDocumentIds`, code: "publication_gate", message: `documento ${documentId} ainda não está preservado e verificado` });
        }
      }
    }
  }

  for (const proposal of proposals) {
    if (!byCandidate.has(proposal.candidacyId)) issues.push({ path: `${path}.proposals.${proposal.id}`, code: "reference", message: "candidatura inexistente" });
    const occurrenceIds = proposal.occurrences.map((occurrence) => occurrence.id);
    if (!occurrenceIds.includes(proposal.canonicalOccurrenceId)) issues.push({ path: `${path}.proposals.${proposal.id}.canonicalOccurrenceId`, code: "reference", message: "ocorrência canônica não consta das ocorrências" });
    for (const occurrence of proposal.occurrences) {
      const document = byDocument.get(occurrence.documentId);
      if (!document || document.candidacyId !== proposal.candidacyId) issues.push({ path: `${path}.proposals.${proposal.id}.occurrences`, code: "reference", message: `documento ${occurrence.documentId} inexistente ou de outra candidatura` });
      if (document && document.sha256 !== proposal.sourceDocumentSha256 && occurrence.id === proposal.canonicalOccurrenceId) issues.push({ path: `${path}.proposals.${proposal.id}.sourceDocumentSha256`, code: "source_version", message: "hash não corresponde ao documento da ocorrência canônica" });
      if (!occurrence.visualVerified) issues.push({ path: `${path}.proposals.${proposal.id}.occurrences`, code: "visual_verification", message: "toda citação exige conferência visual" });
      if (document?.pageCount !== null && occurrence.physicalPage > document.pageCount) issues.push({ path: `${path}.proposals.${proposal.id}.occurrences`, code: "page_bounds", message: `página física ${occurrence.physicalPage} excede as ${document.pageCount} páginas do documento` });
    }
    const canonicalOccurrence = proposal.occurrences.find((occurrence) => occurrence.id === proposal.canonicalOccurrenceId);
    if (canonicalOccurrence && proposal.quoteFull !== canonicalOccurrence.quote) {
      issues.push({ path: `${path}.proposals.${proposal.id}.quoteFull`, code: "literal_quote", message: "citação completa deve ser idêntica à ocorrência canônica" });
    }
    if (typeof proposal.quoteShort === "string" && typeof proposal.quoteFull === "string" && !isLiteralMarkedExcerpt(proposal.quoteShort, proposal.quoteFull)) {
      issues.push({ path: `${path}.proposals.${proposal.id}.quoteShort`, code: "literal_excerpt", message: "citação curta deve ser literal ou usar cortes marcados com [...] em ordem" });
    }
    const proposalDecisions = decisions.filter((decision) => decision.proposalId === proposal.id && ["inclusion", "classification"].includes(decision.type));
    if (proposalDecisions.length === 0) {
      issues.push({ path: `${path}.proposals.${proposal.id}`, code: "coding_decision", message: "proposta exige decisão registrada de inclusão ou classificação" });
    }
    if (Date.parse(proposal.coldReviewedAt) - Date.parse(proposal.codedAt) < 48 * 60 * 60 * 1000) issues.push({ path: `${path}.proposals.${proposal.id}.coldReviewedAt`, code: "cold_review", message: "revisão fria deve ocorrer ao menos 48 horas após a codificação" });
    const referencingFindings = findings.filter((finding) => finding.proposalIds?.includes(proposal.id));
    if (referencingFindings.length !== 1) {
      issues.push({ path: `${path}.proposals.${proposal.id}`, code: "proposal_finding_bijection", message: "proposta deve aparecer exatamente uma vez na cobertura temática" });
    } else {
      const finding = referencingFindings[0];
      if (finding.status !== "proposals" || finding.candidacyId !== proposal.candidacyId || finding.themeId !== proposal.primaryThemeId) {
        issues.push({ path: `${path}.proposals.${proposal.id}`, code: "proposal_finding_bijection", message: "proposta deve pertencer ao finding proposals da mesma candidatura e tema primário" });
      }
    }
  }

  for (const finding of findings) {
    if (!byCandidate.has(finding.candidacyId)) issues.push({ path: `${path}.findings`, code: "reference", message: `candidatura ${finding.candidacyId} inexistente` });
    for (const proposalId of finding.proposalIds) {
      const proposal = byProposal.get(proposalId);
      if (!proposal || proposal.candidacyId !== finding.candidacyId || proposal.primaryThemeId !== finding.themeId) issues.push({ path: `${path}.findings.${finding.candidacyId}.${finding.themeId}`, code: "reference", message: `proposta ${proposalId} inexistente ou incompatível` });
    }
    for (const occurrence of finding.evidence) {
      const document = byDocument.get(occurrence.documentId);
      if (!document || document.candidacyId !== finding.candidacyId) {
        issues.push({ path: `${path}.findings.${finding.candidacyId}.${finding.themeId}.evidence`, code: "reference", message: `documento ${occurrence.documentId} inexistente ou de outra candidatura` });
      } else if (document.pageCount !== null && occurrence.physicalPage > document.pageCount) {
        issues.push({ path: `${path}.findings.${finding.candidacyId}.${finding.themeId}.evidence`, code: "page_bounds", message: `página física ${occurrence.physicalPage} excede as ${document.pageCount} páginas do documento` });
      }
    }
    const expectedProposalIds = proposals
      .filter((proposal) => proposal.candidacyId === finding.candidacyId && proposal.primaryThemeId === finding.themeId)
      .map((proposal) => proposal.id)
      .sort();
    const actualProposalIds = [...(finding.proposalIds ?? [])].sort();
    if (expectedProposalIds.length !== actualProposalIds.length || expectedProposalIds.some((id, index) => id !== actualProposalIds[index])) {
      issues.push({ path: `${path}.findings.${finding.candidacyId}.${finding.themeId}.proposalIds`, code: "proposal_finding_bijection", message: "proposalIds deve ser exatamente o conjunto de propostas da candidatura e do tema" });
    }
    if (expectedProposalIds.length > 0 && finding.status !== "proposals") {
      issues.push({ path: `${path}.findings.${finding.candidacyId}.${finding.themeId}.status`, code: "finding_conflict", message: "tema com propostas não pode usar diagnóstico, ausência, pendência ou não verificável" });
    }
  }

  if (isRecord(value.release)) {
    const candidateIds = candidacies.map((candidate) => candidate.id);
    if (candidateIds.some((id) => !value.release.candidateIds?.includes(id)) || value.release.candidateIds?.some((id) => !byCandidate.has(id))) issues.push({ path: `${path}.release.candidateIds`, code: "release_candidates", message: "deve corresponder às candidaturas do snapshot" });
    const published = candidacies.filter((candidate) => candidate.editorialStatus === "published").map((candidate) => candidate.id);
    if (published.some((id) => !value.release.publishedCandidateIds?.includes(id)) || value.release.publishedCandidateIds?.some((id) => !published.includes(id))) issues.push({ path: `${path}.release.publishedCandidateIds`, code: "release_candidates", message: "deve corresponder às candidaturas publicadas" });
  }
}

export const datasetSchema = schema("dataset", validateDatasetInto);

export function validateDataset(value) {
  return datasetSchema.parse(value);
}

export const DATA_ENUMS = Object.freeze({
  themeIds: Object.freeze([...THEME_IDS]),
  secondaryTagIds: Object.freeze([...SECONDARY_TAG_IDS]),
  findingStatuses: Object.freeze([...FINDING_STATUSES]),
  editorialStatuses: Object.freeze([...EDITORIAL_STATUSES]),
  reconciliationStatuses: Object.freeze([...RECONCILIATION_STATUSES]),
});
