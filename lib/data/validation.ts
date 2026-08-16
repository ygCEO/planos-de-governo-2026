import type {
  CandidateThemeFinding,
  Candidacy,
  CodingDecision,
  Dataset,
  DatasetRelease,
  MethodologyRelease,
  PlanDocumentVersion,
  Proposal,
  SourceOccurrence,
} from "./contracts";
import {
  candidateThemeFindingSchema as findingSchema,
  candidacySchema as rawCandidacySchema,
  codingDecisionSchema as decisionSchema,
  datasetReleaseSchema as releaseSchema,
  datasetSchema as rawDatasetSchema,
  methodologyReleaseSchema as methodologySchema,
  planDocumentVersionSchema as documentSchema,
  proposalSchema as rawProposalSchema,
  sourceOccurrenceSchema as occurrenceSchema,
  DataValidationError,
  DATA_ENUMS,
} from "./schema.js";

interface RuntimeSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: InstanceType<typeof DataValidationError> };
}

export const candidacySchema = rawCandidacySchema as RuntimeSchema<Candidacy>;
export const planDocumentVersionSchema = documentSchema as RuntimeSchema<PlanDocumentVersion>;
export const sourceOccurrenceSchema = occurrenceSchema as RuntimeSchema<SourceOccurrence>;
export const proposalSchema = rawProposalSchema as RuntimeSchema<Proposal>;
export const candidateThemeFindingSchema = findingSchema as RuntimeSchema<CandidateThemeFinding>;
export const methodologyReleaseSchema = methodologySchema as RuntimeSchema<MethodologyRelease>;
export const datasetReleaseSchema = releaseSchema as RuntimeSchema<DatasetRelease>;
export const codingDecisionSchema = decisionSchema as RuntimeSchema<CodingDecision>;
export const datasetSchema = rawDatasetSchema as RuntimeSchema<Dataset>;

export { DataValidationError, DATA_ENUMS };

export function validateDataset(value: unknown): Dataset {
  return datasetSchema.parse(value);
}
