import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { GITHUB_REPOSITORY_URL } from "@/lib/site-config";

const pageTitle = "Apontar uma correção";
const pageDescription = "Envie uma correção documentada e acompanhe publicamente sua análise.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: { title: pageTitle, description: pageDescription, images: [] },
  twitter: { card: "summary", title: pageTitle, description: pageDescription, images: [] },
};

export default function CorrectionsPage() {
  const issueUrl = `${GITHUB_REPOSITORY_URL}/issues/new?template=correcao.yml`;
  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell correction-page" tabIndex={-1}>
        <div className="eyebrow">Participação</div>
        <h1>Encontrou um erro?</h1>
        <p className="lede">Envie a fonte, a página e uma explicação objetiva. O relato e a decisão ficam públicos.</p>
        <div className="correction-box">
          <div>
            <h2>Antes de enviar</h2>
            <ul>
              <li>Informe a URL ou o identificador da proposta afetada.</li>
              <li>Indique o documento oficial e a página que sustentam a correção.</li>
              <li>Não inclua CPF, título eleitoral, telefone ou outros dados pessoais.</li>
            </ul>
          </div>
          <a className="primary-button" href={issueUrl} target="_blank" rel="noreferrer">Abrir pedido de correção <span aria-hidden="true">↗</span></a>
        </div>
        <p className="privacy-note">O formulário é hospedado no GitHub e exige uma conta. Correções aceitas geram uma nova versão dos dados e uma entrada no histórico.</p>
      </article>
      <SiteFooter />
    </main>
  );
}
