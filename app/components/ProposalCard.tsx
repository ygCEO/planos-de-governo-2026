import Link from "next/link";

export type ProposalCardData = {
  id: string;
  excerpt: string;
  fullQuote: string;
  documentLabel: string;
  pdfPage: number;
  printedPage?: string | null;
  officialUrl: string;
  archiveUrl?: string | null;
};

export function ProposalCard({ proposal }: { proposal: ProposalCardData }) {
  const hasLongQuote = proposal.fullQuote.trim() !== proposal.excerpt.trim();
  const pageLabel = proposal.printedPage
    ? `página física ${proposal.pdfPage} · impressa ${proposal.printedPage}`
    : `página ${proposal.pdfPage}`;

  return (
    <article className="proposal-card" id={`proposta-${proposal.id}`}>
      <blockquote>“{proposal.excerpt}”</blockquote>
      {hasLongQuote && (
        <details>
          <summary>Ver trecho completo</summary>
          <blockquote>“{proposal.fullQuote}”</blockquote>
        </details>
      )}
      <div className="citation-meta">
        <span>{proposal.documentLabel}</span>
        <span>{pageLabel}</span>
      </div>
      <div className="source-links">
        <a href={proposal.officialUrl} target="_blank" rel="noreferrer">Abrir no TSE <span aria-hidden="true">↗</span></a>
        {proposal.archiveUrl && <a href={proposal.archiveUrl} target="_blank" rel="noreferrer">Cópia preservada <span aria-hidden="true">↗</span></a>}
        <Link href={`/propostas/${proposal.id}`}>Auditar proposta <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
