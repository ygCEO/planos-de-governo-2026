import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const latestRoot = path.join(projectRoot, "public", "dados", "latest");

const expectedThemeIds = [
  "economia-impostos",
  "emprego-renda",
  "saude",
  "educacao",
  "seguranca-justica",
  "programas-sociais-habitacao",
  "meio-ambiente-clima",
  "infraestrutura-energia",
  "agricultura-agronegocio",
  "estado-instituicoes",
  "tecnologia-ciencia-inovacao",
  "politica-externa-defesa",
  "outros-temas",
];

const themeStatuses = new Set([
  "proposals",
  "diagnosis_only",
  "not_found",
  "pending",
  "unverifiable",
]);

function normalizedKey(key) {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isPersonalKey(key) {
  const normalized = normalizedKey(key);
  return [
    "cpf",
    "tituloeleitor",
    "email",
    "telefone",
    "celular",
    "endereco",
    "logradouro",
  ].some((token) => normalized.includes(token)) || /^(?:nr)?cep(?:candidato)?$/.test(normalized);
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(latestRoot, filename), "utf8"));
}

function arrayFrom(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  assert.fail(`exportação não contém array em ${keys.join("/")}`);
}

function releaseFrom(manifest) {
  return manifest.release ?? manifest;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV termina dentro de campo com aspas");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows.shift();
  assert.equal(new Set(headers).size, headers.length, "cabeçalhos CSV duplicados");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values, rowIndex) => {
      assert.equal(values.length, headers.length, `CSV inválido na linha ${rowIndex + 2}`);
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
}

function pick(object, ...keys) {
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
  }
  return undefined;
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, strings));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, strings));
  }
  return strings;
}

function isValidCpf(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length) => {
    const sum = digits
      .slice(0, length)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return (remainder === 10 ? 0 : remainder) === Number(digits[length]);
  };
  return check(9) && check(10);
}

function assertNoPersonalValues(values, label) {
  const text = values.join("\n");
  assert.doesNotMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, `${label} contém e-mail`);
  const candidates = text.match(/(?<!\d)(?:\d{3}[.\s-]?){3}\d{2}(?!\d)/g) ?? [];
  const cpfs = candidates
    .map((candidate) => candidate.replace(/\D/g, ""))
    .filter(isValidCpf);
  assert.deepEqual(cpfs, [], `${label} contém valor com CPF válido`);
}

async function listPublicDataFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPublicDataFiles(entryPath));
    else if (/\.(?:json|csv)$/i.test(entry.name)) files.push(entryPath);
  }
  return files.sort();
}

async function validateSnapshotDirectory(snapshotRoot) {
  const directoryId = path.basename(snapshotRoot);
  const entries = await readdir(snapshotRoot, { withFileTypes: true });
  const filenames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (filenames.length === 0) return null;
  assert.ok(filenames.includes("manifest.json"), `${directoryId} não possui manifest.json`);

  const manifest = JSON.parse(await readFile(path.join(snapshotRoot, "manifest.json"), "utf8"));
  const release = releaseFrom(manifest);
  assert.equal(release.id, directoryId, `${directoryId} diverge do ID do manifesto`);
  assert.match(release.id, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(release.schemaVersion, "1.0.0");
  assert.ok(Array.isArray(release.files) && release.files.length >= 4, `${directoryId} sem arquivos íntegros`);

  const declaredNames = [];
  for (const file of release.files) {
    assert.equal(file.path, path.basename(file.path), `${directoryId} contém caminho não plano`);
    assert.notEqual(file.path, "manifest.json", `${directoryId} não pode autoassinar o manifesto`);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(file.byteSize) && file.byteSize > 0);
    const bytes = await readFile(path.join(snapshotRoot, file.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, file.sha256, `${directoryId}/${file.path}: hash divergente`);
    assert.equal(bytes.byteLength, file.byteSize, `${directoryId}/${file.path}: tamanho divergente`);
    declaredNames.push(file.path);
  }
  assert.equal(new Set(declaredNames).size, declaredNames.length, `${directoryId} declara arquivo duplicado`);
  assert.deepEqual(
    filenames,
    ["manifest.json", ...declaredNames].sort(),
    `${directoryId} contém arquivo público não declarado`,
  );
  return { manifest, filenames };
}

test("todos os snapshots históricos são íntegros e latest replica exatamente current", async () => {
  const manifest = await readJson("manifest.json");
  const release = releaseFrom(manifest);
  const snapshotId = pick(release, "id", "snapshotId", "snapshot_id");

  assert.match(snapshotId, /^\d{4}-\d{2}-\d{2}(?:[.-]\d+)?$/);
  assert.equal(pick(release, "schemaVersion", "schema_version"), "1.0.0");
  assert.equal(pick(release, "methodologyVersion", "methodology_version"), "1.0");

  const snapshotsRoot = path.join(projectRoot, "public", "dados", "snapshots");
  const snapshotDirectories = (await readdir(snapshotsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(snapshotsRoot, entry.name))
    .sort();
  const validated = (await Promise.all(snapshotDirectories.map(validateSnapshotDirectory))).filter(Boolean);
  assert.ok(validated.length > 0, "nenhum snapshot versionado encontrado");

  const currentRelease = JSON.parse(
    await readFile(path.join(projectRoot, "content", "releases", "current.yaml"), "utf8"),
  );
  assert.equal(snapshotId, currentRelease.id, "latest não corresponde ao release current");
  const currentRoot = path.join(snapshotsRoot, currentRelease.id);
  assert.ok((await stat(currentRoot)).isDirectory());
  const latestFiles = (await readdir(latestRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const currentFiles = (await readdir(currentRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(latestFiles, currentFiles, "latest e current expõem conjuntos diferentes");
  for (const filename of currentFiles) {
    const [latestBytes, snapshotBytes] = await Promise.all([
      readFile(path.join(latestRoot, filename)),
      readFile(path.join(currentRoot, filename)),
    ]);
    assert.deepEqual(latestBytes, snapshotBytes, `${filename} difere entre latest e current`);
  }
});

test("exportações preservam os 13 temas e as invariantes editoriais", async () => {
  const [manifest, themeExport, candidacyExport, proposalExport, coverageText] =
    await Promise.all([
      readJson("manifest.json"),
      readJson("temas.json"),
      readJson("candidaturas.json"),
      readJson("propostas.json"),
      readFile(path.join(latestRoot, "cobertura.csv"), "utf8"),
    ]);

  const themes = arrayFrom(themeExport, ["themes", "temas"]);
  const candidacies = arrayFrom(candidacyExport, ["candidacies", "candidaturas"]);
  const proposals = arrayFrom(proposalExport, ["proposals", "propostas"]);
  const coverage = parseCsv(coverageText);
  const themeIds = themes.map((theme) => pick(theme, "id", "themeId", "tema_id"));

  assert.deepEqual(themeIds, expectedThemeIds);
  assert.equal(new Set(themeIds).size, 13);

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const candidacyOrder = [...candidacies].sort((left, right) => {
    const nameComparison = collator.compare(
      pick(left, "ballotName", "ballot_name", "nomeUrna", "nome_urna"),
      pick(right, "ballotName", "ballot_name", "nomeUrna", "nome_urna"),
    );
    if (nameComparison !== 0) return nameComparison;
    return Number(pick(left, "ballotNumber", "ballot_number", "numero")) -
      Number(pick(right, "ballotNumber", "ballot_number", "numero"));
  });
  assert.deepEqual(candidacies, candidacyOrder, "candidaturas fora da ordem pt-BR");

  const proposalsByCandidateTheme = new Map();
  for (const proposal of proposals) {
    const candidateId = pick(proposal, "candidacyId", "candidacy_id");
    const themeId = pick(proposal, "primaryThemeId", "primary_theme_id");
    assert.ok(expectedThemeIds.includes(themeId), `tema inválido em ${proposal.id}`);
    assert.match(pick(proposal, "sourceDocumentSha256", "source_document_sha256"), /^[a-f0-9]{64}$/);
    assert.ok(pick(proposal, "coldReviewedAt", "cold_reviewed_at"), `sem revisão fria: ${proposal.id}`);

    const occurrences = pick(proposal, "occurrences", "ocorrencias");
    assert.ok(Array.isArray(occurrences) && occurrences.length > 0, `sem ocorrência: ${proposal.id}`);
    for (const occurrence of occurrences) {
      assert.equal(pick(occurrence, "visualVerified", "visual_verified"), true);
      assert.ok(Number(pick(occurrence, "physicalPage", "physical_page")) >= 1);
    }

    const key = `${candidateId}\0${themeId}`;
    proposalsByCandidateTheme.set(key, (proposalsByCandidateTheme.get(key) ?? 0) + 1);
  }

  const coverageByCandidate = new Map();
  for (const finding of coverage) {
    const candidateId = pick(finding, "candidacyId", "candidacy_id", "candidatura_id");
    const themeId = pick(finding, "themeId", "theme_id", "tema_id");
    const status = pick(finding, "status");
    assert.ok(expectedThemeIds.includes(themeId), `tema de cobertura inválido: ${themeId}`);
    assert.ok(themeStatuses.has(status), `estado de cobertura inválido: ${status}`);

    const proposalCount = proposalsByCandidateTheme.get(`${candidateId}\0${themeId}`) ?? 0;
    if (status === "proposals") assert.ok(proposalCount > 0);
    if (status === "not_found" || status === "diagnosis_only") assert.equal(proposalCount, 0);

    const items = coverageByCandidate.get(candidateId) ?? [];
    items.push({ themeId, status });
    coverageByCandidate.set(candidateId, items);
  }

  const release = releaseFrom(manifest);
  const publishedIds = new Set(
    pick(release, "publishedCandidateIds", "published_candidate_ids") ?? [],
  );
  for (const candidacy of candidacies) {
    const candidateId = pick(candidacy, "id", "candidacyId", "candidacy_id");
    const editorialStatus = pick(candidacy, "editorialStatus", "editorial_status");
    assert.equal(publishedIds.has(candidateId), editorialStatus === "published");
    if (!publishedIds.has(candidateId)) continue;

    const findings = coverageByCandidate.get(candidateId) ?? [];
    assert.equal(findings.length, 13, `${candidateId} não possui 13 estados`);
    assert.deepEqual(
      new Set(findings.map((finding) => finding.themeId)),
      new Set(expectedThemeIds),
    );
    assert.ok(findings.every(({ status }) => status !== "pending"));
  }
});

test("latest e snapshots históricos não contêm campos ou valores pessoais", async () => {
  const publicDataRoot = path.join(projectRoot, "public", "dados");
  const filenames = await listPublicDataFiles(publicDataRoot);
  assert.ok(filenames.length >= 8);

  for (const filename of filenames) {
    const contents = await readFile(filename, "utf8");
    if (filename.endsWith(".json")) {
      const value = JSON.parse(contents);
      const forbidden = collectKeys(value).filter(isPersonalKey);
      assert.deepEqual(forbidden, [], `${filename} contém chaves pessoais`);
      assertNoPersonalValues(collectStrings(value), filename);
    } else {
      const [header = ""] = contents.split(/\r?\n/, 1);
      const keys = parseCsv(`${header}\n`).length === 0
        ? header.split(",").map((key) => key.replace(/^"|"$/g, ""))
        : [];
      assert.deepEqual(
        keys.filter(isPersonalKey),
        [],
        `${filename} contém cabeçalhos pessoais`,
      );
      const rows = parseCsv(contents);
      assertNoPersonalValues(rows.flatMap((row) => Object.values(row)), filename);
    }
  }
});

test("bundle publicável não incorpora CPF válido nem endereço de e-mail", async () => {
  const distRoot = path.join(projectRoot, "dist");
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (/\.(?:js|json|html|csv|txt|map)$/i.test(entry.name)) files.push(entryPath);
    }
  }
  await visit(distRoot);
  assert.ok(files.length > 0, "build dist ausente");
  for (const filename of files) {
    assertNoPersonalValues([await readFile(filename, "utf8")], filename);
  }
});
