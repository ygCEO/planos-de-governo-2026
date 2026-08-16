import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { StatusPill } from "@/app/components/StatusPill";
import type { CandidateThemeFinding } from "@/lib/data/contracts";
import {
  getCandidacy,
  getTheme,
  listCandidacies,
  listCandidateDocuments,
  listFindingsForCandidacy,
} from "@/lib/data/loaders";

type PageProps = { params: Promise<{ id: string }> };

const findingLabels: Record<CandidateThemeFinding["status"], string> = {
  proposals: "Propostas identificadas",
  diagnosis_only: "Apenas diagnóstico",
  not_found: "Menção não identificada após leitura integral",
  pending: "Em análise",
  unverifiable: "Não foi possível verificar",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function generateStaticParams() {
  return listCandidacies().map((candidate) => ({ id: candidate.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const candidate = getCandidacy(id);
  if (!candidate) return {};
  const title = candidate.ballotName;
  const description = `Situação oficial, corpus de documentos e cobertura dos 13 temas de ${candidate.ballotName}.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function CandidacyPage({ params }: PageProps) {
  const { id } = await params;
  const candidate = getCandidacy(id);
  if (!candidate) notFound();
  const documents = listCandidateDocuments(candidate.id);
  const findings = listFindingsForCandidacy(candidate.id);

  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell candidacy-page" tabIndex={-1}>
        <div className="eyebrow">Pedido de registro · Presidência da República</div>
        <div className="candidacy-heading">
          <div>
            <h1>{candidate.ballotName}</h1>
            <p className="lede">Número {candidate.ballotNumber} · {candidate.party.acronym}{candidate.party.name ? ` — ${candidate.party.name}` : ""}</p>
          </div>
          <StatusPill status={candidate.editorialStatus} />
        </div>

        <dl className="facts-grid">
          <div><dt>Situação oficial</dt><dd>{candidate.officialStatus.label}</dd></div>
          <div><dt>Conciliação</dt><dd>{candidate.reconciliationStatus === "reconciled" ? "Fontes conciliadas" : "Consolidação em andamento"}</dd></div>
          <div><dt>Identificador TSE</dt><dd>{candidate.sqCandidate}</dd></div>
          <div><dt>Fonte observada</dt><dd>{dateFormatter.format(new Date(candidate.sourceObservedAt))}</dd></div>
        </dl>

        <section className="candidate-detail-section" aria-labelledby="documents-title">
          <div className="section-heading">
            <div><span className="section-kicker">Corpus oficial</span><h2 id="documents-title">Documentos observados</h2></div>
            <p>O arquivo oficial e sua cópia preservada são exibidos separadamente. O hash identifica exatamente a versão analisada.</p>
          </div>
          {documents.length > 0 ? (
            <ol className="document-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <div><strong>{document.officialFilename}</strong><code>SHA-256 {document.sha256}</code></div>
                  <div className="document-meta"><span>{document.byteSize.toLocaleString("pt-BR")} bytes</span><span>{document.pageCountVerified && document.pageCount ? `${document.pageCount} páginas` : "Paginação aguardando conferência"}</span></div>
                  <div className="source-links">
                    <a href={document.canonicalUrl} target="_blank" rel="noreferrer">Fonte oficial do TSE <span aria-hidden="true">↗</span></a>
                    {document.preservedPublicUrl
                      ? <a href={document.preservedPublicUrl} target="_blank" rel="noreferrer">Cópia preservada <span aria-hidden="true">↗</span></a>
                      : <span>Cópia pública em preparação</span>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state"><strong>Documentos aguardando consolidação</strong><p>Isso não significa que o pedido não tenha apresentado plano. A fonte oficial ainda não está consistente entre os recursos observados.</p></div>
          )}
        </section>

        <section className="candidate-detail-section" aria-labelledby="coverage-title">
          <div className="section-heading">
            <div><span className="section-kicker">Cobertura metodológica</span><h2 id="coverage-title">Os 13 temas</h2></div>
            <p>Nenhum estado pendente é apresentado como ausência. A candidatura só entra no comparador após o fechamento integral.</p>
          </div>
          <ol className="theme-finding-list">
            {findings.map((finding) => {
              const theme = getTheme(finding.themeId);
              if (!theme) return null;
              return (
                <li key={finding.themeId}>
                  <Link href={`/temas/${theme.id}`}><span>{String(theme.order).padStart(2, "0")}</span><strong>{theme.title}</strong><small>{findingLabels[finding.status]}</small><span aria-hidden="true">→</span></Link>
                </li>
              );
            })}
          </ol>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
