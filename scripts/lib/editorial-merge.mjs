function setEquals(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function mergeSources(existing = [], observed = []) {
  const sources = new Map();
  for (const source of [...existing, ...observed]) {
    const key = [source.kind, source.url, source.resourceId, source.documentId, source.archiveEntry].join("|");
    sources.set(key, source);
  }
  return [...sources.values()];
}

function mergeDocument(existing, observed) {
  if (!existing) return observed;
  if (!observed) return existing;
  const merged = {
    ...existing,
    ...observed,
    sources: mergeSources(existing.sources, observed.sources),
    supersedesDocumentId: observed.supersedesDocumentId ?? existing.supersedesDocumentId,
  };
  if (existing.pageCountVerified) {
    merged.pageCount = existing.pageCount;
    merged.pageCountVerified = true;
  }
  if (existing.preservationStatus === "preserved") {
    merged.preservationStatus = "preserved";
    merged.preservedObjectKey = existing.preservedObjectKey;
    merged.preservedPublicUrl = existing.preservedPublicUrl;
  }
  return merged;
}

function hashesFor(candidate, documentsById) {
  return new Set((candidate?.planDocumentIds ?? []).map((id) => documentsById.get(id)?.sha256).filter(Boolean));
}

function corpusSignature(candidate, documentsById) {
  if (candidate?.observedDocumentCorpora) {
    return JSON.stringify({
      zipSha256s: candidate.observedDocumentCorpora.zipSha256s ?? [],
      restSha256s: candidate.observedDocumentCorpora.restSha256s ?? [],
    });
  }
  return JSON.stringify({ legacySha256s: [...hashesFor(candidate, documentsById)].sort() });
}

function pendingFinding(candidacyId, themeId) {
  return {
    candidacyId,
    themeId,
    status: "pending",
    proposalIds: [],
    evidence: [],
    reviewedAt: null,
    note: null,
  };
}

export function mergeEditorialMetadata({
  observedCandidates,
  observedDocuments,
  existingCandidates = [],
  existingDocuments = [],
  existingFindings = [],
  existingProposals = [],
  themes,
}) {
  const existingCandidatesById = new Map(existingCandidates.map((candidate) => [candidate.id, candidate]));
  const observedCandidatesById = new Map(observedCandidates.map((candidate) => [candidate.id, candidate]));
  const existingDocumentsById = new Map(existingDocuments.map((document) => [document.id, document]));
  const observedDocumentsById = new Map(observedDocuments.map((document) => [document.id, document]));
  const documentsById = new Map();
  for (const id of new Set([...existingDocumentsById.keys(), ...observedDocumentsById.keys()])) {
    documentsById.set(id, mergeDocument(existingDocumentsById.get(id), observedDocumentsById.get(id)));
  }

  const findingsByCandidateAndTheme = new Map(
    existingFindings.map((finding) => [`${finding.candidacyId}|${finding.themeId}`, finding]),
  );
  const sourceChangedCandidateIds = [];
  const candidateIds = new Set([...existingCandidatesById.keys(), ...observedCandidatesById.keys()]);
  const candidates = [...candidateIds].map((id) => {
    const existing = existingCandidatesById.get(id);
    const observed = observedCandidatesById.get(id);
    if (!existing) return observed;
    if (!observed) {
      sourceChangedCandidateIds.push(id);
      return { ...existing, editorialStatus: "source_changed" };
    }

    const previousHashes = Array.isArray(existing.observedDocumentSha256s)
      ? new Set(existing.observedDocumentSha256s)
      : hashesFor(existing, existingDocumentsById);
    const observedHashes = hashesFor(observed, observedDocumentsById);
    const corpusChanged = existing.observedDocumentCorpora
      ? corpusSignature(existing, existingDocumentsById) !== corpusSignature(observed, observedDocumentsById)
      : !setEquals(previousHashes, observedHashes);
    if (corpusChanged) sourceChangedCandidateIds.push(id);
    const sourceBlocksPublication = ["source_changed", "awaiting_consolidation"].includes(observed.editorialStatus);
    return {
      ...existing,
      ...observed,
      editorialStatus: corpusChanged
        ? "source_changed"
        : sourceBlocksPublication
          ? observed.editorialStatus
          : existing.editorialStatus,
      planDocumentIds: [...new Set([...existing.planDocumentIds, ...observed.planDocumentIds])].sort(),
      observedDocumentSha256s: [...observedHashes].sort(),
      observedDocumentCorpora: observed.observedDocumentCorpora,
      corpusObservedAt: corpusChanged
        ? (observed.corpusObservedAt ?? observed.sourceObservedAt)
        : (existing.corpusObservedAt ?? existing.sourceObservedAt),
      quality: existing.quality,
    };
  }).sort((left, right) => left.ballotName.localeCompare(right.ballotName, "pt-BR", { sensitivity: "base" }) || left.ballotNumber - right.ballotNumber);

  const findings = candidates.flatMap((candidate) => themes.map((theme) => (
    findingsByCandidateAndTheme.get(`${candidate.id}|${theme.id}`) ?? pendingFinding(candidate.id, theme.id)
  )));
  const referencedDocumentIds = new Set(candidates.flatMap((candidate) => candidate.planDocumentIds));
  const documents = [...documentsById.values()]
    .filter((document) => referencedDocumentIds.has(document.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    candidates,
    documents,
    findings,
    proposals: existingProposals,
    sourceChangedCandidateIds: [...new Set(sourceChangedCandidateIds)].sort(),
  };
}
