import type { EditorialStatus } from "@/lib/data/contracts";

export type { EditorialStatus } from "@/lib/data/contracts";

const labels: Record<EditorialStatus, string> = {
  pending: "Em análise",
  awaiting_consolidation: "Aguardando consolidação",
  in_review: "Em revisão",
  ready: "Pronta para publicar",
  published: "Publicada",
  source_changed: "Fonte atualizada",
  unverifiable: "Não foi possível verificar",
};

export function StatusPill({ status }: { status: EditorialStatus }) {
  return <span className={`status-pill status-${status}`}>{labels[status]}</span>;
}
