import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const pageTitle = "Histórico de mudanças";
const pageDescription = "Versões da metodologia, dos dados e das correções do projeto.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: { title: pageTitle, description: pageDescription, images: [] },
  twitter: { card: "summary", title: pageTitle, description: pageDescription, images: [] },
};

export default function ChangelogPage() {
  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell" tabIndex={-1}>
        <div className="eyebrow">Registro público</div>
        <h1>Histórico de mudanças</h1>
        <p className="lede">Nada é corrigido silenciosamente. Cada alteração informa o que mudou, por quê e quais dados foram afetados.</p>
        <ol className="timeline">
          <li>
            <time dateTime="2026-08-15">15 ago 2026</time>
            <div><span className="change-type">Metodologia</span><h2>Versão 1.0</h2><p>Congelamento das regras de classificação, do corpus documental, dos estados de cobertura e dos controles para codificador único.</p></div>
          </li>
          <li>
            <time dateTime="2026-08-15">15 ago 2026</time>
            <div><span className="change-type">Projeto</span><h2>Estrutura pública inicial</h2><p>Publicação da metodologia, das rotas de transparência e do primeiro manifesto de dados, ainda sem propostas classificadas.</p></div>
          </li>
        </ol>
      </article>
      <SiteFooter />
    </main>
  );
}
