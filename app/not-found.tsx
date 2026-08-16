import Link from "next/link";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export default function NotFound() {
  return (
    <main>
      <SiteHeader />
      <section id="conteudo-principal" className="not-found shell" tabIndex={-1}>
        <div className="eyebrow">Erro 404</div>
        <h1>Esta página não foi encontrada.</h1>
        <p>O endereço pode ter mudado ou ainda não fazer parte da edição publicada.</p>
        <Link className="primary-button" href="/">Voltar ao início <span aria-hidden="true">→</span></Link>
      </section>
      <SiteFooter />
    </main>
  );
}
