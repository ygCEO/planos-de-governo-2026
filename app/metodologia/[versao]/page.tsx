import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import methodology from "@/content/metodologia/1.0.md?raw";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

type PageProps = { params: Promise<{ versao: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { versao } = await params;
  if (versao !== "1.0") return {};
  const title = "Metodologia 1.0";
  const description = "Regras públicas de extração, classificação, citação, revisão e controle de viés.";
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function MethodologyPage({ params }: PageProps) {
  const { versao } = await params;
  if (versao !== "1.0") notFound();

  return (
    <main>
      <SiteHeader />
      <article id="conteudo-principal" className="interior shell methodology-page" tabIndex={-1}>
        <div className="eyebrow">Livro de códigos · versão congelada</div>
        <div className="methodology-meta">
          <h1>Metodologia 1.0</h1>
          <div><span>Publicada</span><strong>15 ago 2026</strong><span>Estado</span><strong>Congelada</strong></div>
        </div>
        <p className="lede">As regras abaixo definem o que conta como proposta, como cada trecho é classificado e como decisões editoriais podem ser auditadas.</p>
        <div className="methodology-body prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{methodology}</ReactMarkdown>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
