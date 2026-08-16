import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Planos de Governo 2026 — início">
          <span className="wordmark-mark" aria-hidden="true">PG</span>
          <span>Planos de Governo <strong>2026</strong></span>
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/metodologia/1.0">Metodologia</Link>
          <Link href="/fontes">Fontes</Link>
          <Link href="/dados">Dados abertos</Link>
        </nav>
      </header>
    </>
  );
}
