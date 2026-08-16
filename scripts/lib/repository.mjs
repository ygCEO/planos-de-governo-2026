import { join } from "node:path";
import { validateDataset } from "../../lib/data/schema.js";
import { listFiles, readYaml } from "./io.mjs";

async function readMany(directory) {
  const paths = await listFiles(directory, ".yaml");
  return Promise.all(paths.map(readYaml));
}

export async function readEditorialRepository(root) {
  const content = join(root, "content");
  const [themes, secondaryTags, methodology, release, source, allCandidacies, allDocuments, coverageFiles, proposals, codingDecisions] = await Promise.all([
    readYaml(join(content, "catalog/temas.yaml")),
    readYaml(join(content, "catalog/etiquetas.yaml")),
    readYaml(join(content, "releases/metodologia.yaml")),
    readYaml(join(content, "releases/current.yaml")),
    readYaml(join(content, "source/tse-2026.yaml")),
    readMany(join(content, "candidaturas")),
    readMany(join(content, "documentos")),
    readMany(join(content, "cobertura")),
    readMany(join(content, "propostas")),
    readMany(join(content, "decisoes")),
  ]);
  const activeCandidateIds = new Set(release.candidateIds);
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const candidacies = allCandidacies
    .filter((candidate) => activeCandidateIds.has(candidate.id))
    .sort((left, right) => collator.compare(left.ballotName, right.ballotName) || left.ballotNumber - right.ballotNumber);
  const candidateOrder = new Map(candidacies.map((candidate, index) => [candidate.id, index]));
  const themeOrder = new Map(themes.map((theme) => [theme.id, theme.order]));
  const activeDocumentIds = new Set(candidacies.flatMap((candidate) => candidate.planDocumentIds));
  const documents = allDocuments
    .filter((document) => activeDocumentIds.has(document.id))
    .sort((left, right) => (candidateOrder.get(left.candidacyId) ?? 999) - (candidateOrder.get(right.candidacyId) ?? 999) || left.id.localeCompare(right.id));
  const findings = coverageFiles.flat()
    .filter((finding) => activeCandidateIds.has(finding.candidacyId))
    .sort((left, right) => (candidateOrder.get(left.candidacyId) ?? 999) - (candidateOrder.get(right.candidacyId) ?? 999) || (themeOrder.get(left.themeId) ?? 999) - (themeOrder.get(right.themeId) ?? 999));
  const activeProposals = proposals
    .filter((proposal) => activeCandidateIds.has(proposal.candidacyId))
    .sort((left, right) => (candidateOrder.get(left.candidacyId) ?? 999) - (candidateOrder.get(right.candidacyId) ?? 999) || left.documentOrder - right.documentOrder || left.id.localeCompare(right.id));
  const activeDecisions = codingDecisions
    .filter((decision) => activeCandidateIds.has(decision.candidacyId))
    .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt) || left.id.localeCompare(right.id));
  const dataset = {
    schemaVersion: "1.0.0",
    release,
    methodology,
    source,
    themes,
    secondaryTags,
    candidacies,
    documents,
    findings,
    proposals: activeProposals,
    codingDecisions: activeDecisions,
  };
  return validateDataset(dataset);
}
