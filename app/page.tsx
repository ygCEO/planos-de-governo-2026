import Link from "next/link";
import { CandidateCoverage } from "./components/CandidateCoverage";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { getDatasetRelease, getTseSourceStatus, listCandidacies, listThemes } from "@/lib/data/loaders";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default function Home() {
  const themes = listThemes();
  const candidacies = listCandidacies();
  const release = getDatasetRelease();
  const source = getTseSourceStatus();
  const sourceState = release.sourceStatus === "stable"
    ? "Fontes oficiais conciliadas"
    : "Consolidação das fontes em andamento";

  return (
    <main>
      <SiteHeader />

      <section id="conteudo-principal" className="hero shell" aria-labelledby="hero-title" tabIndex={-1}>
        <div className="eyebrow">Eleições presidenciais · Brasil</div>
        <h1 id="hero-title">Compare propostas.<br />Confira as fontes.</h1>
        <p className="hero-copy">
          Um guia independente para consultar o que cada plano registrado no TSE
          propõe — tema por tema, com citações literais e metodologia pública.
        </p>
        <div className="status-strip" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span><strong>{sourceState}</strong> · Última sincronização: {dateFormatter.format(new Date(source.observedAt))}.</span>
        </div>
      </section>

      <section className="themes-section shell" aria-labelledby="themes-title">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Explore por assunto</span>
            <h2 id="themes-title">13 temas, a mesma regra para todos</h2>
          </div>
          <p>As candidaturas serão exibidas em ordem alfabética, sem notas ou rankings.</p>
        </div>
        <ol className="theme-grid">
          {themes.map((theme) => (
            <li key={theme.id}>
              <Link href={`/temas/${theme.id}`}>
                <span className="theme-number">{String(theme.order).padStart(2, "0")}</span>
                <span className="theme-name">{theme.title}</span>
                <span className="theme-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="principles shell" aria-labelledby="principles-title">
        <span className="section-kicker">Nosso compromisso</span>
        <h2 id="principles-title">Comparar não é avaliar.</h2>
        <div className="principle-grid">
          <p><strong>Fonte única</strong><span>Planos oficiais protocolados no TSE.</span></p>
          <p><strong>Rastreabilidade</strong><span>Toda proposta leva ao documento e à página.</span></p>
          <p><strong>Simetria</strong><span>Mesmos temas, regras e componentes visuais.</span></p>
        </div>
      </section>
      <CandidateCoverage candidates={candidacies.map((candidate) => ({
        id: candidate.id,
        ballotName: candidate.ballotName,
        number: String(candidate.ballotNumber),
        party: candidate.party.acronym,
        legalStatus: candidate.officialStatus.label,
        editorialStatus: candidate.editorialStatus,
      }))} />
      <SiteFooter />
    </main>
  );
}
