import Link from "next/link";
import { EditorialStatus, StatusPill } from "./StatusPill";

export type CandidateCoverageItem = {
  id: string;
  ballotName: string;
  number: string;
  party: string;
  legalStatus: string;
  editorialStatus: EditorialStatus;
};

export function CandidateCoverage({ candidates }: { candidates: CandidateCoverageItem[] }) {
  return (
    <section className="coverage-section shell" aria-labelledby="coverage-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Cobertura editorial</span>
          <h2 id="coverage-title">Todos os pedidos oficiais</h2>
        </div>
        <p>“Em análise” indica trabalho editorial pendente — nunca ausência de proposta no documento.</p>
      </div>
      {candidates.length > 0 ? (
        <ol className="candidate-list">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <Link href={`/candidaturas/${candidate.id}`}>
                <span className="candidate-number">{candidate.number}</span>
                <span className="candidate-identity"><strong>{candidate.ballotName}</strong><small>{candidate.party} · {candidate.legalStatus}</small></span>
                <StatusPill status={candidate.editorialStatus} />
                <span className="candidate-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <strong>Aguardando reconciliação das fontes oficiais</strong>
          <p>Os pedidos aparecerão aqui assim que os arquivos diários e o DivulgaCandContas estiverem consistentes.</p>
        </div>
      )}
    </section>
  );
}
