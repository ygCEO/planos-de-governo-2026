export const DATA_SCHEMA_VERSION = "1.0.0" as const;

export type ThemeId =
  | "economia-impostos"
  | "emprego-renda"
  | "saude"
  | "educacao"
  | "seguranca-justica"
  | "programas-sociais-habitacao"
  | "meio-ambiente-clima"
  | "infraestrutura-energia"
  | "agricultura-agronegocio"
  | "estado-instituicoes"
  | "tecnologia-ciencia-inovacao"
  | "politica-externa-defesa"
  | "outros-temas";

export type SecondaryTagId =
  | "cultura"
  | "esporte"
  | "direitos-humanos"
  | "igualdade-racial"
  | "povos-indigenas"
  | "mulheres-genero"
  | "diversidade-sexual-genero"
  | "infancia-adolescencia"
  | "pessoas-com-deficiencia"
  | "pessoas-idosas";

export type ThemeFindingStatus =
  | "proposals"
  | "diagnosis_only"
  | "not_found"
  | "pending"
  | "unverifiable";

export type EditorialStatus =
  | "pending"
  | "awaiting_consolidation"
  | "in_review"
  | "ready"
  | "published"
  | "source_changed"
  | "unverifiable";

export type ReconciliationStatus =
  | "reconciled"
  | "csv_only"
  | "rest_only"
  | "pending_documents"
  | "document_mismatch"
  | "candidate_mismatch";

export interface ThemeDefinition {
  id: ThemeId;
  order: number;
  title: string;
  shortTitle: string;
  scope: string;
  boundaryExamples: string[];
  residual: boolean;
}

export interface SecondaryTagDefinition {
  id: SecondaryTagId;
  title: string;
  description: string;
}

export interface OfficialStatus {
  code: string;
  label: string;
  source: "tse-csv" | "divulgacand-rest" | "reconciled";
  observedAt: string;
}

export interface OfficialTotalizationStatus {
  label: string | null;
  source: "divulgacand-rest" | "unknown";
  observedAt: string;
}

export interface CandidacyQuality {
  firstPassCompletedAt: string | null;
  secondPassCompletedAt: string | null;
  coldReviewCompletedAt: string | null;
  retestCompletedAt: string | null;
  readingHours: number | null;
}

export interface Candidacy {
  id: string;
  sqCandidate: string;
  electionYear: 2026;
  ballotName: string;
  ballotNumber: number;
  party: {
    acronym: string;
    name: string | null;
  };
  office: "presidente";
  jurisdiction: "BR";
  officialStatus: OfficialStatus;
  officialTotalizationStatus?: OfficialTotalizationStatus;
  editorialStatus: EditorialStatus;
  reconciliationStatus: ReconciliationStatus;
  sourceIds: {
    csvCandidateId: string | null;
    restCandidateId: string | null;
    csvElectionCode: string | null;
    restElectionId: string | null;
  };
  planDocumentIds: string[];
  observedDocumentSha256s?: string[];
  observedDocumentCorpora?: {
    zipSha256s: string[];
    restSha256s: string[];
  };
  sourceObservedAt: string;
  corpusObservedAt?: string;
  quality: CandidacyQuality;
}

export interface DocumentArchiveSource {
  kind: "ckan_zip" | "divulgacand_rest";
  url: string;
  resourceId: string | null;
  documentId: string | null;
  archiveEntry: string | null;
  observedAt: string;
}

export interface PlanDocumentVersion {
  id: string;
  candidacyId: string;
  officialFilename: string;
  mimeType: "application/pdf";
  canonicalUrl: string;
  capturedAt: string;
  sha256: string;
  byteSize: number;
  pageCount: number | null;
  pageCountVerified: boolean;
  preservedObjectKey: string;
  preservedPublicUrl: string | null;
  preservationStatus: "pending_upload" | "preserved" | "failed";
  supersedesDocumentId: string | null;
  sources: DocumentArchiveSource[];
}

export interface SourceOccurrence {
  id: string;
  documentId: string;
  section: string | null;
  physicalPage: number;
  printedPage: string | null;
  quote: string;
  visualVerified: boolean;
}

export interface CodingCriteria {
  a1ActionCommitment: boolean;
  a2IdentifiableObject: boolean;
  a3FederalExecutiveAgent: boolean;
  rationale: string;
}

export interface Proposal {
  id: string;
  candidacyId: string;
  canonicalOccurrenceId: string;
  occurrences: SourceOccurrence[];
  quoteShort: string;
  quoteFull: string;
  primaryThemeId: ThemeId;
  secondaryTagIds: SecondaryTagId[];
  documentOrder: number;
  criteria: CodingCriteria;
  codedAt: string;
  coldReviewedAt: string;
  sourceDocumentSha256: string;
}

export interface CandidateThemeFinding {
  candidacyId: string;
  themeId: ThemeId;
  status: ThemeFindingStatus;
  proposalIds: string[];
  evidence: SourceOccurrence[];
  reviewedAt: string | null;
  note: string | null;
}

export interface MethodologyRelease {
  version: string;
  status: "draft" | "frozen" | "superseded";
  releasedAt: string;
  sourcePath: string;
  commit: string | null;
  changelog: string[];
}

export interface DatasetFileIntegrity {
  path: string;
  sha256: string;
  byteSize: number;
}

export interface DatasetRelease {
  id: string;
  schemaVersion: typeof DATA_SCHEMA_VERSION;
  methodologyVersion: string;
  createdAt: string;
  sourceObservedAt: string;
  candidateIds: string[];
  publishedCandidateIds: string[];
  sourceStatus: "stable" | "divergent";
  contentSha256: string;
  files: DatasetFileIntegrity[];
}

export interface CodingDecision {
  id: string;
  candidacyId: string;
  proposalId: string | null;
  type: "inclusion" | "exclusion" | "segmentation" | "deduplication" | "classification";
  rule: "A1" | "A2" | "A3" | "boundary" | "duplicate" | "segmentation";
  rationale: string;
  decidedAt: string;
  coldReviewedAt: string | null;
  reviewer: string;
}

export interface TseSourceSnapshot {
  cadence?: "hourly" | "daily" | "weekly";
  syncSignature?: string;
  syncSignatureVersion?: "semantic-v2";
  datasetId: string;
  datasetUrl: string;
  licenseId: "cc-by";
  ckanMetadataModifiedAt: string;
  observedAt: string;
  csvGeneratedAt: string | null;
  resources: Array<{
    id: string;
    name: string;
    format: string;
    url: string;
    etag: string | null;
    lastModified: string | null;
    sha256: string;
  }>;
  rest: {
    url: string;
    electionId: string;
    observedAt: string;
    candidateIds: string[];
    planDocuments: Array<{
      candidacyId: string;
      documentId: string;
      officialFilename: string;
      canonicalUrl: string;
      position: number;
      sha256: string;
      byteSize: number;
      lastModified: string | null;
    }>;
  };
  reconciliation: {
    csvOnlyCandidateIds: string[];
    restOnlyCandidateIds: string[];
    currentRestDocumentsMissingFromZip: string[];
    restDocumentsMissingFromZip?: string[];
    zipDocumentsMissingFromRest: string[];
    candidateMetadataMismatches?: Array<{
      candidacyId: string;
      fields: Array<"ballotName" | "ballotNumber" | "partyAcronym" | "officialStatus">;
    }>;
  };
}

export interface Dataset {
  schemaVersion: typeof DATA_SCHEMA_VERSION;
  release: DatasetRelease;
  methodology: MethodologyRelease;
  source: TseSourceSnapshot;
  themes: ThemeDefinition[];
  secondaryTags: SecondaryTagDefinition[];
  candidacies: Candidacy[];
  documents: PlanDocumentVersion[];
  findings: CandidateThemeFinding[];
  proposals: Proposal[];
  codingDecisions: CodingDecision[];
}
