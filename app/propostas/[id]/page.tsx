import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import {
  getCandidacy,
  getProposal,
  getTheme,
  listCandidateDocuments,
  listProposals,
  listSecondaryTags,
} from "@/lib/data/loaders";

type PageProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return listProposals().map((proposal) => ({ id: proposal.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const proposal = getProposal(id);
  if (!proposal) return {};
  const candidate = getCandidacy(proposal.candidacyId);
  const theme = getTheme(proposal.primaryThemeId);
  const title = `Proposta de ${candidate?.ballotName ?? "candidatura"}`;
  const description = `Citação completa, documento, página e decisões metodológicas${theme ? ` sobre ${theme.title.toLocaleLowerCase("pt-BR")}` : ""}.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function ProposalPage({ params }: PageProps) {
  const { id } = await params;
  const proposal = getProposal(id);
  if (!proposal) notFound();
  const candidate = getCandidacy(proposal.candidacyId);
  const theme = getTheme(proposal.primaryThemeId);
  const occurrence = proposal.occurrences.find((item) => item.id === proposal.canonicalOccurrenceId)
    ?? proposal.occurrences[0];
  const document = listCandidateDocuments(proposal.candidacyId)
    .find((item) => item.id === occurrence?.documentId);
  if (!candidate || !theme || !occurrence || !document) notFound();
  const tagCatalog = listSecondaryTags();
  const tags = proposal.secondaryTagIds.map((tagId) => tagCatalog.find((tag) => tag.id === tagId)?.title ?? tagId);

  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell proposal-detail-page" tabIndex={-1}>
        <div className="eyebrow">Registro editorial auditável</div>
        <h1>Proposta de {candidate.ballotName}</h1>
        <p className="lede">{theme.title} · documento {document.officialFilename} · página física {occurrence.physicalPage}{occurrence.printedPage ? `, impressa ${occurrence.printedPage}` : ""}</p>

        <div className="proposal-audit-grid">
          <section className="proposal-quote" aria-labelledby="quote-title">
            <span className="section-kicker">Citação completa</span>
            <h2 id="quote-title">Trecho do documento</h2>
            <blockquote>“{proposal.quoteFull}”</blockquote>
            {occurrence.section && <p>Seção: {occurrence.section}</p>}
          </section>
          <aside className="audit-sidebar" aria-label="Referência da proposta">
            <dl>
              <div><dt>ID estável</dt><dd>{proposal.id}</dd></div>
              <div><dt>Tema primário</dt><dd><Link href={`/temas/${theme.id}`}>{theme.title}</Link></dd></div>
              <div><dt>Etiquetas</dt><dd>{tags.length ? tags.join(", ") : "Nenhuma"}</dd></div>
              <div><dt>Conferência visual</dt><dd>{occurrence.visualVerified ? "Concluída" : "Pendente"}</dd></div>
            </dl>
          </aside>
        </div>

        <section className="audit-section" aria-labelledby="source-title">
          <span className="section-kicker">Fonte exata</span>
          <h2 id="source-title">Documento e integridade</h2>
          <dl className="source-audit-list">
            <div><dt>Arquivo</dt><dd>{document.officialFilename}</dd></div>
            <div><dt>SHA-256</dt><dd><code>{proposal.sourceDocumentSha256}</code></dd></div>
            <div><dt>Página</dt><dd>Física {occurrence.physicalPage}{occurrence.printedPage ? ` · impressa ${occurrence.printedPage}` : ""}</dd></div>
          </dl>
          <div className="source-links">
            <a href={document.canonicalUrl} target="_blank" rel="noreferrer">Abrir fonte oficial do TSE <span aria-hidden="true">↗</span></a>
            {document.preservedPublicUrl && <a href={document.preservedPublicUrl} target="_blank" rel="noreferrer">Abrir cópia preservada <span aria-hidden="true">↗</span></a>}
          </div>
        </section>

        <section className="audit-section" aria-labelledby="criteria-title">
          <span className="section-kicker">Decisão A1–A3</span>
          <h2 id="criteria-title">Por que o trecho conta como proposta</h2>
          <ul className="criteria-list">
            <li><strong>A1 · Compromisso de ação</strong><span>{proposal.criteria.a1ActionCommitment ? "Atendido" : "Não atendido"}</span></li>
            <li><strong>A2 · Objeto identificável</strong><span>{proposal.criteria.a2IdentifiableObject ? "Atendido" : "Não atendido"}</span></li>
            <li><strong>A3 · Agente federal</strong><span>{proposal.criteria.a3FederalExecutiveAgent ? "Atendido" : "Não atendido"}</span></li>
          </ul>
          <p>{proposal.criteria.rationale}</p>
          <p><Link href="/metodologia/1.0">Consultar metodologia 1.0 <span aria-hidden="true">→</span></Link></p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
