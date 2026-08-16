import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <span className="footer-mark" aria-hidden="true">PG</span>
          <p>Uma leitura comparável e auditável dos planos presidenciais registrados no TSE.</p>
        </div>
        <nav aria-label="Transparência">
          <strong>Transparência</strong>
          <Link href="/metodologia/1.0">Metodologia</Link>
          <Link href="/changelog">Histórico de mudanças</Link>
          <Link href="/dados">Baixar os dados</Link>
        </nav>
        <nav aria-label="Participação">
          <strong>Participação</strong>
          <Link href="/correcoes">Apontar uma correção</Link>
          <a href="https://dadosabertos.tse.jus.br/dataset/candidatos-2026" rel="noreferrer" target="_blank">
            Dados oficiais do TSE <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
      <div className="shell footer-legal">
        <span>Projeto independente, sem vínculo com candidaturas, partidos ou com o TSE.</span>
        <span>Metodologia e dados editoriais · CC BY 4.0</span>
      </div>
    </footer>
  );
}
