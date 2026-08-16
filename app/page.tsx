import Link from "next/link";

const themes = [
  "Economia e impostos",
  "Emprego e renda",
  "Saúde",
  "Educação",
  "Segurança pública e justiça",
  "Programas sociais e habitação",
  "Meio ambiente e clima",
  "Infraestrutura e energia",
  "Agricultura e agronegócio",
  "Estado e instituições",
  "Tecnologia, ciência e inovação",
  "Política externa e defesa",
  "Outros temas",
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Planos de Governo 2026 — início">
          <span className="wordmark-mark" aria-hidden="true">PG</span>
          <span>Planos de Governo <strong>2026</strong></span>
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/metodologia/1.0">Metodologia</Link>
          <Link href="/dados">Dados abertos</Link>
        </nav>
      </header>

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="eyebrow">Eleições presidenciais · Brasil</div>
        <h1 id="hero-title">Compare propostas.<br />Confira as fontes.</h1>
        <p className="hero-copy">
          Um guia independente para consultar o que cada plano registrado no TSE
          propõe — tema por tema, com citações literais e metodologia pública.
        </p>
        <div className="status-strip" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span><strong>Preparação editorial</strong> · Os pedidos de registro ainda estão sendo consolidados pelo TSE.</span>
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
          {themes.map((theme, index) => (
            <li key={theme}>
              <Link href={`/temas/${index + 1}`}>
                <span className="theme-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="theme-name">{theme}</span>
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
    </main>
  );
}
