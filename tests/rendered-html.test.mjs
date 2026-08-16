import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const forbiddenTrackers =
  /googletagmanager|google-analytics|gtag\s*\(|segment\.com|plausible\.io|posthog|hotjar|facebook\.net\/.*fbevents/i;

let workerPromise;

async function getWorker() {
  workerPromise ??= (async () => {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("audit", `${process.pid}-${Date.now()}`);
    const workerModule = await import(workerUrl.href);
    return workerModule.default;
  })();
  return workerPromise;
}

async function request(pathname) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(new URL(pathname, "http://local.test"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render(pathname, expectedStatus = 200) {
  const response = await request(pathname);
  assert.equal(response.status, expectedStatus, pathname);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
    pathname,
  );
  return response.text();
}

const publicPages = [
  ["/", /Compare propostas/i],
  ["/metodologia/1.0", /Metodologia 1\.0/i],
  ["/fontes", /Fontes oficiais/i],
  ["/changelog", /Histórico de mudanças/i],
  ["/dados", /Dados abertos/i],
  ["/correcoes", /Encontrou um erro/i],
];

test("renderiza as rotas públicas de transparência em português", async (t) => {
  for (const [pathname, expectedText] of publicPages) {
    await t.test(pathname, async () => {
      const html = await render(pathname);
      assert.match(html, /<html[^>]*\blang=["']pt-BR["']/i);
      assert.match(html, /<main(?:\s|>)/i);
      assert.match(html, /<h1(?:\s|>)/i);
      assert.match(html, expectedText);
      assert.doesNotMatch(html, forbiddenTrackers);
    });
  }
});

test("expõe metodologia, fontes, downloads e correções sem rastreamento", async () => {
  const [home, methodology, sources, data, corrections] = await Promise.all([
    render("/"),
    render("/metodologia/1.0"),
    render("/fontes"),
    render("/dados"),
    render("/correcoes"),
  ]);

  assert.match(home, /13 temas/i);
  assert.match(home, /sem notas ou rankings/i);
  assert.match(methodology, /compara, não avalia/i);
  assert.match(sources, /dadosabertos\.tse\.jus\.br/i);

  for (const filename of [
    "manifest.json",
    "propostas.json",
    "propostas.csv",
    "cobertura.csv",
  ]) {
    assert.match(data, new RegExp(`/dados/latest/${filename.replace(".", "\\.")}`));
  }

  assert.match(corrections, /issues\/new\?template=correcao\.yml/i);
  assert.match(corrections, /não inclua CPF/i);
  assert.doesNotMatch(
    `${home}${methodology}${sources}${data}${corrections}`,
    forbiddenTrackers,
  );
});

test("não publica uma versão de metodologia desconhecida", async () => {
  const html = await render("/metodologia/nao-existe", 404);
  assert.match(html, /não encontrad|404/i);
});

test("tema real mantém candidaturas em ordem e desabilita comparação prematura", async () => {
  const candidacies = JSON.parse(
    await readFile(new URL("../public/dados/latest/candidaturas.json", import.meta.url), "utf8"),
  );
  assert.ok(candidacies.length >= 2);
  const ids = candidacies.slice(0, 2).map(({ id }) => id).join(",");
  const [theme, invalidComparison] = await Promise.all([
    render("/temas/saude"),
    render(`/temas/saude?comparar=${ids}`),
  ]);

  assert.match(theme, /Tema\s*(?:<!-- -->)?03(?:<!-- -->)?\s*de 13/i);
  assert.match(theme, /Destaque de 2 a 4 candidaturas/i);
  assert.match(theme, /comparação será liberada quando ao menos duas candidaturas/i);
  assert.match(theme, /<fieldset[^>]*\bdisabled(?:="")?/i);

  let previousIndex = -1;
  for (const candidacy of candidacies) {
    const index = invalidComparison.indexOf(candidacy.ballotName);
    assert.ok(index > previousIndex, `${candidacy.ballotName} fora da ordem renderizada`);
    previousIndex = index;
  }
  assert.doesNotMatch(invalidComparison, /Exibindo 2 candidaturas/i);
  assert.match(invalidComparison, /Análise editorial ainda não concluída|Aguardando consolidação das fontes/i);
  assert.doesNotMatch(theme, /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*og\.png/i);
});

test("detalhe de candidatura real é auditável e não herda imagem social genérica", async () => {
  const candidacies = JSON.parse(
    await readFile(new URL("../public/dados/latest/candidaturas.json", import.meta.url), "utf8"),
  );
  const candidate = candidacies.find(({ planDocumentIds }) => planDocumentIds.length > 0)
    ?? candidacies[0];
  const html = await render(`/candidaturas/${candidate.id}`);

  assert.match(html, new RegExp(candidate.ballotName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(html, new RegExp(candidate.sqCandidate));
  assert.match(html, /Os 13 temas/i);
  assert.match(html, /SHA-256|Documentos aguardando consolidação/i);
  assert.doesNotMatch(html, /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*og\.png/i);
});

test("IDs inexistentes não fabricam candidatura nem proposta", async () => {
  const [candidate, proposal] = await Promise.all([
    render("/candidaturas/nao-existe", 404),
    render("/propostas/nao-existe", 404),
  ]);
  assert.match(candidate, /não encontrad|404/i);
  assert.match(proposal, /não encontrad|404/i);
});

test("filtro de segundo turno depende da situação oficial", async () => {
  const html = await render("/temas/saude?turno=2");
  assert.match(html, /Nenhuma candidatura está marcada para o segundo turno/i);
  assert.match(html, /situação oficial publicada pelo TSE/i);
});
