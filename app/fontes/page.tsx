import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { TSE_DATASET_URL, TSE_RESOLUTION_URL } from "@/lib/site-config";

const pageTitle = "Fontes oficiais";
const pageDescription = "Como os documentos oficiais do TSE são capturados, preservados e vinculados às propostas.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: { title: pageTitle, description: pageDescription, images: [] },
  twitter: { card: "summary", title: pageTitle, description: pageDescription, images: [] },
};

export default function SourcesPage() {
  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell" tabIndex={-1}>
        <div className="eyebrow">Rastreabilidade</div>
        <h1>Fontes oficiais</h1>
        <p className="lede">O projeto usa exclusivamente documentos e metadados publicados pela Justiça Eleitoral.</p>

        <div className="content-grid">
          <aside className="on-this-page" aria-label="Nesta página">
            <span>Fonte canônica</span><span>Preservação</span><span>Atualizações</span>
          </aside>
          <div className="prose">
            <section>
              <h2>Fonte canônica</h2>
              <p>Os planos e a situação dos pedidos de registro vêm do DivulgaCandContas e do Portal de Dados Abertos do Tribunal Superior Eleitoral. Sites de campanha, entrevistas, debates e redes sociais ficam fora da base.</p>
              <div className="link-cards">
                <a href={TSE_DATASET_URL} target="_blank" rel="noreferrer"><strong>Dados Abertos do TSE</strong><span>Candidaturas e propostas de governo de 2026 ↗</span></a>
                <a href={TSE_RESOLUTION_URL} target="_blank" rel="noreferrer"><strong>Resolução TSE nº 23.609</strong><span>Regras oficiais do registro de candidaturas ↗</span></a>
              </div>
            </section>
            <section>
              <h2>Corpus e preservação</h2>
              <p>Uma candidatura pode possuir mais de um documento de proposta. Todos os documentos oficiais observados formam o corpus da candidatura. Cada arquivo recebe um hash SHA-256 e uma cópia imutável; nenhuma versão é sobrescrita.</p>
              <p>Uma citação sempre identifica o arquivo exato, a página física do PDF e, quando houver, o número impresso. O link oficial do TSE permanece destacado como origem canônica.</p>
            </section>
            <section>
              <h2>Atualizações</h2>
              <p>As fontes são conciliadas antes de qualquer publicação. Enquanto houver novos registros ou divergência entre os sistemas oficiais, a verificação é mais frequente; após estabilidade, passa a diária e depois semanal.</p>
              <p>Se um documento mudar, a candidatura sai temporariamente do comparador atual. A versão anterior continua disponível no histórico até a recodificação.</p>
            </section>
            <p className="next-link"><Link href="/metodologia/1.0">Ler a metodologia completa <span aria-hidden="true">→</span></Link></p>
          </div>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
