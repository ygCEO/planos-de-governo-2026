function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function normalizeOfficialStatus(value) {
  const normalized = normalizeComparableText(value);
  if (["#NE", "AGUARDANDO JULGAMENTO"].includes(normalized)) return "AWAITING_JUDGMENT";
  return normalized;
}

function comparableCandidateMetadataFromCsv(candidate) {
  return {
    ballotName: normalizeComparableText(candidate?.NM_URNA_CANDIDATO),
    ballotNumber: Number(candidate?.NR_CANDIDATO),
    partyAcronym: normalizeComparableText(candidate?.SG_PARTIDO),
    officialStatus: normalizeOfficialStatus(candidate?.DS_SITUACAO_CANDIDATURA),
  };
}

function comparableCandidateMetadataFromRest(candidate) {
  return {
    ballotName: normalizeComparableText(candidate?.ballotName),
    ballotNumber: Number(candidate?.ballotNumber),
    partyAcronym: normalizeComparableText(candidate?.partyAcronym),
    officialStatus: normalizeOfficialStatus(candidate?.officialStatus),
  };
}

/**
 * Concilia somente os quatro campos eleitorais cuja equivalencia e obrigatoria.
 * A normalizacao ignora caixa, acentos e espacos redundantes; `#NE`, usado no
 * CSV consolidado, e a descricao REST `Aguardando julgamento` representam o
 * mesmo estado oficial pendente.
 */
export function compareCandidateMetadata(csvCandidate, restCandidate) {
  const csv = comparableCandidateMetadataFromCsv(csvCandidate);
  const rest = comparableCandidateMetadataFromRest(restCandidate);
  const fields = ["ballotName", "ballotNumber", "partyAcronym", "officialStatus"];
  const mismatchedFields = fields.filter((field) => (
    csv[field] === ""
    || rest[field] === ""
    || (field === "ballotNumber" && (!Number.isFinite(csv[field]) || !Number.isFinite(rest[field])))
    || csv[field] !== rest[field]
  ));
  return {
    matches: mismatchedFields.length === 0,
    mismatchedFields,
    csv,
    rest,
  };
}

function digestFrom(value) {
  return typeof value === "string" ? value : value?.sha256;
}

/** Compara o corpus inteiro, sem atribuir semantica especial a position 0. */
export function compareDocumentCorpora(restDocuments = [], zipDocumentsOrHashes = []) {
  const restSha256s = restDocuments.map(digestFrom).filter(Boolean);
  const zipSha256s = zipDocumentsOrHashes.map(digestFrom).filter(Boolean);
  const count = (values) => values.reduce((counts, digest) => counts.set(digest, (counts.get(digest) ?? 0) + 1), new Map());
  const restCounts = count(restSha256s);
  const zipCounts = count(zipSha256s);
  const restOnlySha256s = [];
  const zipOnlySha256s = [];
  for (const digest of new Set([...restCounts.keys(), ...zipCounts.keys()])) {
    const difference = (restCounts.get(digest) ?? 0) - (zipCounts.get(digest) ?? 0);
    if (difference > 0) restOnlySha256s.push(...Array(difference).fill(digest));
    if (difference < 0) zipOnlySha256s.push(...Array(-difference).fill(digest));
  }
  restOnlySha256s.sort();
  zipOnlySha256s.sort();
  return {
    matches: restOnlySha256s.length === 0 && zipOnlySha256s.length === 0,
    restOnlySha256s,
    zipOnlySha256s,
  };
}

export function restDocumentsMissingFromZip(restDocuments = [], zipDocumentsOrHashes = []) {
  const available = new Map();
  for (const value of zipDocumentsOrHashes) {
    const digest = digestFrom(value);
    if (digest) available.set(digest, (available.get(digest) ?? 0) + 1);
  }
  return restDocuments.filter((document) => {
    const digest = digestFrom(document);
    const remaining = available.get(digest) ?? 0;
    if (remaining === 0) return true;
    available.set(digest, remaining - 1);
    return false;
  });
}
