import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CSS mantém foco visível, redução de movimento e comparação empilhada no celular", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /a:focus-visible,[^}]*button:focus-visible,[^}]*summary:focus-visible,[^}]*input:focus-visible\s*\{[^}]*outline:/s);
  assert.doesNotMatch(css, /:focus-visible[^}]*outline:\s*(?:0|none)\b/s);
  assert.match(css, /outline:\s*3px solid var\(--paper\)/);
  assert.match(css, /box-shadow:\s*0 0 0 6px var\(--green\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{/);
  assert.match(css, /\.candidate-theme-grid\.is-comparison\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /\.document-list li\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
  assert.match(css, /transition-duration:\s*\.01ms\s*!important/);
});

test("oferece salto de navegação para um alvo focável em todas as páginas", async () => {
  const [header, ...pages] = await Promise.all([
    readFile(new URL("../app/components/SiteHeader.tsx", import.meta.url), "utf8"),
    ...[
      "page.tsx",
      "not-found.tsx",
      "candidaturas/[id]/page.tsx",
      "changelog/page.tsx",
      "correcoes/page.tsx",
      "dados/page.tsx",
      "fontes/page.tsx",
      "metodologia/[versao]/page.tsx",
      "propostas/[id]/page.tsx",
      "temas/[tema]/page.tsx",
    ].map((path) => readFile(new URL(`../app/${path}`, import.meta.url), "utf8")),
  ]);

  assert.match(header, /href="#conteudo-principal"/);
  for (const page of pages) {
    assert.match(page, /id="conteudo-principal"/);
    assert.match(page, /tabIndex=\{-1\}/);
  }
});

test("interface não deriva classes, estilos ou imagens de partido/candidatura", async () => {
  const [themePage, candidatePage] = await Promise.all([
    readFile(new URL("../app/temas/[tema]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/candidaturas/[id]/page.tsx", import.meta.url), "utf8"),
  ]);
  const source = `${themePage}\n${candidatePage}`;

  assert.doesNotMatch(source, /style=\{[^}]*candidate|className=\{[^}]*party/i);
  assert.doesNotMatch(source, /candidate\.(?:photo|image|color)|party\.(?:color|logo)/i);
  assert.doesNotMatch(source, /<img\b|<Image\b/);
});
