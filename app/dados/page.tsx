import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { getDatasetRelease } from "@/lib/data/loaders";

const pageTitle = "Dados abertos";
const pageDescription = "Baixe os dados, a cobertura editorial e o manifesto de integridade do projeto.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: { title: pageTitle, description: pageDescription, images: [] },
  twitter: { card: "summary", title: pageTitle, description: pageDescription, images: [] },
};

const downloads = [
  ["Manifesto do snapshot", "/dados/latest/manifest.json", "JSON"],
  ["Candidaturas", "/dados/latest/candidaturas.json", "JSON"],
  ["Temas", "/dados/latest/temas.json", "JSON"],
  ["Propostas", "/dados/latest/propostas.json", "JSON"],
  ["Cobertura temática", "/dados/latest/cobertura.csv", "CSV"],
  ["Propostas em tabela", "/dados/latest/propostas.csv", "CSV"],
] as const;

export default function DataPage() {
  const release = getDatasetRelease();
  const immutableManifest = `/dados/snapshots/${release.id}/manifest.json`;
  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell" tabIndex={-1}>
        <div className="eyebrow">Auditoria e reuso</div>
        <h1>Dados abertos</h1>
        <p className="lede">Cada publicação é um snapshot imutável ligado à metodologia e aos hashes das fontes.</p>
        <section className="download-panel" aria-labelledby="latest-data">
          <div>
            <span className="status-pill status-pending">Snapshot {release.id}</span>
            <h2 id="latest-data">Edição atual</h2>
            <p>A estrutura já está publicada. As propostas permanecerão vazias até que uma candidatura complete todas as etapas editoriais.</p>
            <p><a className="text-link" href={immutableManifest}>Abrir manifesto imutável <span aria-hidden="true">→</span></a></p>
          </div>
          <ul className="download-list">
            {downloads.map(([label, href, format]) => (
              <li key={href}><a href={href} download><span>{label}</span><small>{format} ↓</small></a></li>
            ))}
          </ul>
        </section>
        <div className="prose narrow-prose">
          <h2>Licenças</h2>
          <p>O código é disponibilizado sob licença MIT. A metodologia e os dados editoriais usam CC BY 4.0. Os documentos e metadados do TSE mantêm sua atribuição e origem oficial.</p>
          <h2>O que não é publicado</h2>
          <p>A ingestão usa uma lista positiva de campos. CPF, título eleitoral e outros dados pessoais presentes nos arquivos brutos nunca entram no conteúdo, nas exportações ou nos registros do projeto.</p>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
