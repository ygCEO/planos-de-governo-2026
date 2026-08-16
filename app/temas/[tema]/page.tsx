import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonSelector } from "@/app/components/ComparisonSelector";
import { ProposalCard, type ProposalCardData } from "@/app/components/ProposalCard";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { StatusPill } from "@/app/components/StatusPill";
import type { Candidacy, CandidateThemeFinding, Proposal, ThemeId } from "@/lib/data/contracts";
import {
  getTheme,
  getThemeFinding,
  isComparisonEligible,
  listCandidacies,
  listCandidateDocuments,
  listProposals,
  listThemes,
  resolveComparisonSelection,
} from "@/lib/data/loaders";

type PageProps = {
  params: Promise<{ tema: string }>;
  searchParams: Promise<{ comparar?: string | string[]; turno?: string }>;
};

const findingLabels: Record<CandidateThemeFinding["status"], string> = {
  proposals: "Propostas identificadas",
  diagnosis_only: "Apenas diagnóstico identificado",
  not_found: "Não foi identificada menção após leitura integral",
  pending: "Em análise",
  unverifiable: "Não foi possível verificar",
};

export function generateStaticParams() {
  return listThemes().map((theme) => ({ tema: theme.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tema: themeId } = await params;
  const theme = getTheme(themeId);
  if (!theme) return {};
  const title = theme.title;
  const description = `Consulte as propostas sobre ${theme.title.toLocaleLowerCase("pt-BR")}, com citações e fontes oficiais.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

function proposalCardData(proposal: Proposal): ProposalCardData | null {
  const occurrence = proposal.occurrences.find((item) => item.id === proposal.canonicalOccurrenceId)
    ?? proposal.occurrences[0];
  const document = listCandidateDocuments(proposal.candidacyId)
    .find((item) => item.id === occurrence?.documentId);
  if (!occurrence || !document) return null;
  return {
    id: proposal.id,
    excerpt: proposal.quoteShort,
    fullQuote: proposal.quoteFull,
    documentLabel: document.officialFilename,
    pdfPage: occurrence.physicalPage,
    printedPage: occurrence.printedPage,
    officialUrl: document.canonicalUrl,
    archiveUrl: document.preservedPublicUrl,
  };
}

function CandidateThemePanel({ candidate, themeId }: { candidate: Candidacy; themeId: ThemeId }) {
  const finding = getThemeFinding(candidate.id, themeId);
  const proposals = listProposals({ candidacyId: candidate.id, themeId })
    .map(proposalCardData)
    .filter((proposal): proposal is ProposalCardData => proposal !== null);
  const complete = candidate.editorialStatus === "published";

  return (
    <article className="candidate-theme-panel">
      <header>
        <div className="candidate-panel-identity">
          <span className="candidate-number">{candidate.ballotNumber}</span>
          <div>
            <h2>{candidate.ballotName}</h2>
            <p>{candidate.party.acronym} · {candidate.officialStatus.label}</p>
          </div>
        </div>
        <StatusPill status={candidate.editorialStatus} />
      </header>

      {!complete ? (
        <div className="pending-finding">
          <strong>{candidate.editorialStatus === "awaiting_consolidation" ? "Aguardando consolidação das fontes" : "Análise editorial ainda não concluída"}</strong>
          <p>Este estado não informa se o documento contém ou não propostas sobre o tema.</p>
        </div>
      ) : finding ? (
        <div className="published-finding">
          <p className={`finding-label finding-${finding.status}`}>{findingLabels[finding.status]}</p>
          {finding.status === "proposals" && proposals.slice(0, 2).map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
          {finding.status === "proposals" && proposals.length > 2 && (
            <details className="more-proposals">
              <summary>Ver mais {proposals.length - 2} {proposals.length - 2 === 1 ? "proposta" : "propostas"}</summary>
              <div>{proposals.slice(2).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}</div>
            </details>
          )}
          {finding.evidence.length > 0 && finding.status !== "proposals" && (
            <blockquote className="finding-evidence">“{finding.evidence[0].quote}”</blockquote>
          )}
          {finding.note && <p className="finding-note">{finding.note}</p>}
        </div>
      ) : null}

      <footer><Link href={`/candidaturas/${candidate.id}`}>Ver candidatura e documentos <span aria-hidden="true">→</span></Link></footer>
    </article>
  );
}

export default async function ThemePage({ params, searchParams }: PageProps) {
  const [{ tema: themeId }, query] = await Promise.all([params, searchParams]);
  const theme = getTheme(themeId);
  if (!theme) notFound();

  const secondRoundOnly = query.turno === "2";
  const allCandidates = listCandidacies({ secondRoundOnly });
  const comparison = resolveComparisonSelection(query.comparar);
  const visibleCandidates = comparison.valid
    ? allCandidates.filter((candidate) => comparison.candidates.some((selected) => selected.id === candidate.id))
    : allCandidates;

  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell theme-page" tabIndex={-1}>
        <div className="eyebrow">Tema {String(theme.order).padStart(2, "0")} de 13</div>
        <h1>{theme.title}</h1>
        <p className="lede">{theme.scope}</p>

        <ComparisonSelector choices={allCandidates.map((candidate) => ({
          id: candidate.id,
          name: `${candidate.ballotName} · ${candidate.ballotNumber}`,
          published: isComparisonEligible(candidate),
        }))} />

        {comparison.valid && (
          <p className="comparison-note" role="status">
            Exibindo {comparison.candidates.length} candidaturas em ordem alfabética. <Link href={`/temas/${theme.id}`}>Voltar à lista completa</Link>
          </p>
        )}

        <section className={comparison.valid ? "candidate-theme-grid is-comparison" : "candidate-theme-grid"} aria-label={`Candidaturas — ${theme.title}`}>
          {visibleCandidates.length > 0 ? visibleCandidates.map((candidate) => (
            <CandidateThemePanel key={candidate.id} candidate={candidate} themeId={theme.id} />
          )) : (
            <div className="empty-state"><strong>Nenhuma candidatura está marcada para o segundo turno.</strong><p>O filtro só é ativado pela situação oficial publicada pelo TSE.</p></div>
          )}
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
