"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ComparisonChoice = {
  id: string;
  name: string;
  published: boolean;
};

export function ComparisonSelector({ choices }: { choices: ComparisonChoice[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = (searchParams.get("comparar") ?? "")
    .split(",")
    .filter((id) => choices.some((choice) => choice.id === id && choice.published))
    .slice(0, 4);

  function update(next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set("comparar", next.join(","));
    else params.delete("comparar");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggle(id: string) {
    if (selected.includes(id)) update(selected.filter((value) => value !== id));
    else if (selected.length < 4) update([...selected, id]);
  }

  const publishedCount = choices.filter((choice) => choice.published).length;

  return (
    <section className={publishedCount < 2 ? "comparison-selector is-locked" : "comparison-selector"} aria-labelledby="compare-title">
      <div>
        <span className="section-kicker">Comparação opcional</span>
        <h2 id="compare-title">Destaque de 2 a 4 candidaturas</h2>
        <p>
          {publishedCount < 2
            ? "A comparação será liberada quando ao menos duas candidaturas concluírem a revisão."
            : selected.length === 1
              ? "Escolha mais uma candidatura para comparar."
              : selected.length >= 2
                ? `${selected.length} candidaturas destacadas, mantidas em ordem alfabética.`
                : "Selecione candidaturas publicadas; nenhuma seleção altera a ordem alfabética."}
        </p>
      </div>
      <fieldset disabled={publishedCount < 2} hidden={publishedCount < 2}>
        <legend className="sr-only">Candidaturas a destacar</legend>
        {choices.map((choice) => (
          <label key={choice.id} className={!choice.published ? "choice-disabled" : undefined}>
            <input
              checked={selected.includes(choice.id)}
              disabled={!choice.published || (!selected.includes(choice.id) && selected.length >= 4)}
              onChange={() => toggle(choice.id)}
              type="checkbox"
            />
            <span>{choice.name}</span>
          </label>
        ))}
        {selected.length > 0 && <button type="button" onClick={() => update([])}>Limpar seleção</button>}
      </fieldset>
    </section>
  );
}
