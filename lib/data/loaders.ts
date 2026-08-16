import latestDataset from "./generated/latest.json";
import type {
  Candidacy,
  Dataset,
  EditorialStatus,
  Proposal,
  SecondaryTagId,
  ThemeId,
} from "./contracts";
import { datasetSchema } from "./validation";
import { isOfficialSecondRoundStatus } from "./round-status.js";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((nested) => deepFreeze(nested));
  }
  return value;
}

const dataset = deepFreeze(datasetSchema.parse(latestDataset)) as Readonly<Dataset>;
const candidateCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function loadDataset(): Readonly<Dataset> {
  return dataset;
}

export function listThemes() {
  return [...dataset.themes].sort((left, right) => left.order - right.order);
}

export function getTheme(id: string) {
  return dataset.themes.find((theme) => theme.id === id) ?? null;
}

export function listSecondaryTags() {
  return [...dataset.secondaryTags];
}

export function listCandidacies(options: { editorialStatuses?: EditorialStatus[]; secondRoundOnly?: boolean } = {}) {
  const allowed = options.editorialStatuses ? new Set(options.editorialStatuses) : null;
  return dataset.candidacies
    .filter((candidate) => !allowed || allowed.has(candidate.editorialStatus))
    .filter((candidate) => !options.secondRoundOnly || isOfficialSecondRoundCandidate(candidate))
    .sort((left, right) => candidateCollator.compare(left.ballotName, right.ballotName) || left.ballotNumber - right.ballotNumber);
}

export function getCandidacy(id: string | number) {
  return dataset.candidacies.find((candidate) => candidate.id === String(id)) ?? null;
}

export function listCandidateDocuments(candidacyId: string | number) {
  const id = String(candidacyId);
  return dataset.documents.filter((document) => document.candidacyId === id);
}

export function listFindingsForCandidacy(candidacyId: string | number) {
  const id = String(candidacyId);
  const candidate = getCandidacy(id);
  return dataset.findings
    .filter((finding) => finding.candidacyId === id)
    .map((finding) => candidate && isComparisonEligible(candidate)
      ? finding
      : {
          ...finding,
          status: "pending" as const,
          proposalIds: [],
          evidence: [],
          reviewedAt: null,
          note: null,
        })
    .sort((left, right) => (getTheme(left.themeId)?.order ?? 99) - (getTheme(right.themeId)?.order ?? 99));
}

export function getThemeFinding(candidacyId: string | number, themeId: ThemeId) {
  const id = String(candidacyId);
  return listFindingsForCandidacy(id).find((finding) => finding.themeId === themeId) ?? null;
}

export function listProposals(filters: { candidacyId?: string | number; themeId?: ThemeId; secondaryTagId?: SecondaryTagId } = {}) {
  const publishedCandidateIds = new Set(dataset.candidacies.filter(isComparisonEligible).map((candidate) => candidate.id));
  return dataset.proposals
    .filter((proposal) => publishedCandidateIds.has(proposal.candidacyId))
    .filter((proposal) => filters.candidacyId === undefined || proposal.candidacyId === String(filters.candidacyId))
    .filter((proposal) => filters.themeId === undefined || proposal.primaryThemeId === filters.themeId)
    .filter((proposal) => filters.secondaryTagId === undefined || proposal.secondaryTagIds.includes(filters.secondaryTagId))
    .sort((left, right) => left.documentOrder - right.documentOrder || left.id.localeCompare(right.id));
}

export function getProposal(id: string): Readonly<Proposal> | null {
  return listProposals().find((proposal) => proposal.id === id) ?? null;
}

export function isComparisonEligible(candidate: Candidacy) {
  return candidate.editorialStatus === "published" && candidate.reconciliationStatus === "reconciled";
}

export function isOfficialSecondRoundCandidate(candidate: Candidacy) {
  return isOfficialSecondRoundStatus(candidate.officialTotalizationStatus?.label);
}

export function resolveComparisonSelection(raw: string | string[] | null | undefined) {
  const values = Array.isArray(raw) ? raw : (raw ?? "").split(",");
  const selected = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .map(getCandidacy)
    .filter((candidate): candidate is Candidacy => Boolean(candidate && isComparisonEligible(candidate)))
    .sort((left, right) => candidateCollator.compare(left.ballotName, right.ballotName) || left.ballotNumber - right.ballotNumber)
    .slice(0, 4);
  return {
    candidates: selected,
    valid: selected.length >= 2 && selected.length <= 4,
    canonicalQuery: selected.map((candidate) => candidate.id).join(","),
  };
}

export function getDatasetRelease() {
  return dataset.release;
}

export function getTseSourceStatus() {
  return dataset.source;
}
