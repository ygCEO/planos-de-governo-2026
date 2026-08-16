import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCsvRecords } from "../scripts/lib/csv.mjs";
import { sha256, stableJson, writeIfChanged } from "../scripts/lib/io.mjs";
import { readZipEntries } from "../scripts/lib/zip.mjs";
import { SAFE_CSV_FIELDS } from "../scripts/tse/sync-metadata.mjs";

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { filenameBytes, data } of entries) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filenameBytes.length, 26);
    localParts.push(local, filenameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filenameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, filenameBytes);
    localOffset += local.length + filenameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

test("interpreta CSV oficial Latin-1, separado por ponto e vírgula", () => {
  const bytes = Buffer.from(
    'SQ_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA\r\n123;"JOÃO; DA SILVA";APTO\r\n',
    "latin1",
  );
  const decoded = new TextDecoder("windows-1252").decode(bytes);
  const records = parseCsvRecords(decoded, ";");

  assert.deepEqual(records, [
    {
      SQ_CANDIDATO: "123",
      NM_URNA_CANDIDATO: "JOÃO; DA SILVA",
      DS_SITUACAO_CANDIDATURA: "APTO",
    },
  ]);
});

test("lista positiva da ingestão exclui identificadores pessoais", () => {
  assert.deepEqual(SAFE_CSV_FIELDS, [
    "DT_GERACAO",
    "HH_GERACAO",
    "CD_ELEICAO",
    "CD_CARGO",
    "DS_CARGO",
    "SQ_CANDIDATO",
    "NR_CANDIDATO",
    "NM_URNA_CANDIDATO",
    "CD_SITUACAO_CANDIDATURA",
    "DS_SITUACAO_CANDIDATURA",
    "NR_PARTIDO",
    "SG_PARTIDO",
    "NM_PARTIDO",
  ]);
  assert.ok(SAFE_CSV_FIELDS.every((field) => !/CPF|TITULO|EMAIL|TELEFONE|ENDERECO/i.test(field)));
});

test("preserva múltiplos documentos e nomes Windows-1252 em ZIP oficial", () => {
  const archive = storedZip([
    {
      filenameBytes: Buffer.from("proposta_caf\xe9.pdf", "latin1"),
      data: Buffer.from("%PDF-1.7 primeiro"),
    },
    {
      filenameBytes: Buffer.from("anexo.pdf", "ascii"),
      data: Buffer.from("%PDF-1.7 segundo"),
    },
  ]);
  const entries = readZipEntries(archive);

  assert.deepEqual(entries.map(({ name }) => name), ["proposta_café.pdf", "anexo.pdf"]);
  assert.equal(entries[0].data.toString("utf8"), "%PDF-1.7 primeiro");
  assert.equal(entries[1].data.toString("utf8"), "%PDF-1.7 segundo");
});

test("rejeita ZIP malformado antes de processar documentos", () => {
  assert.throws(
    () => readZipEntries(Buffer.from("isto não é um arquivo zip")),
    /ZIP inválido/,
  );
});

test("hash e escrita idempotente distinguem mudança real de fonte", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-audit-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const target = path.join(temporaryRoot, "fonte.json");
  const first = stableJson({ z: 1, nested: { b: 2, a: 1 } });
  const sameLogicalValue = stableJson({ nested: { a: 1, b: 2 }, z: 1 });
  const changed = stableJson({ nested: { a: 1, b: 3 }, z: 1 });

  assert.equal(first, sameLogicalValue);
  assert.equal(await writeIfChanged(target, first), true);
  assert.equal(await writeIfChanged(target, sameLogicalValue), false);
  assert.equal(await writeIfChanged(target, changed), true);
  assert.notEqual(sha256(first), sha256(changed));
  assert.equal(await readFile(target, "utf8"), changed);
});
