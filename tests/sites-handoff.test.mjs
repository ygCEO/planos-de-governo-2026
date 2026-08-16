import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createSitesHandoff,
  verifySitesHandoff,
} from "../.github/scripts/sites-handoff.mjs";

const execFileAsync = promisify(execFile);
const packageScript = fileURLToPath(new URL("../.github/scripts/package-site.sh", import.meta.url));
const commit = "a".repeat(40);

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "planos-sites-handoff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(path.join(root, "dist/server"), { recursive: true }),
    mkdir(path.join(root, "dist/client"), { recursive: true }),
    mkdir(path.join(root, ".openai"), { recursive: true }),
    mkdir(path.join(root, "public/dados/latest"), { recursive: true }),
    mkdir(path.join(root, "content/releases"), { recursive: true }),
  ]);
  const hosting = { project_id: "appgprj_test", d1: null, r2: "PDF_ARCHIVE" };
  await Promise.all([
    writeFile(path.join(root, "dist/server/index.js"), "export default {};\n"),
    writeFile(path.join(root, "dist/client/index.html"), "<!doctype html><title>Teste</title>\n"),
    writeFile(path.join(root, ".openai/hosting.json"), `${JSON.stringify(hosting, null, 2)}\n`),
    writeFile(path.join(root, "public/dados/latest/manifest.json"), `${JSON.stringify({ id: "2026-08-15.7" }, null, 2)}\n`),
    writeFile(path.join(root, "content/releases/metodologia.yaml"), `${JSON.stringify({
      version: "1.0",
      status: "frozen",
      commit: "b".repeat(40),
    }, null, 2)}\n`),
  ]);
  return { root, hosting };
}

test("empacotador produz o contrato exigido pelo Sites", async (t) => {
  const { root, hosting } = await fixture(t);
  const archive = path.join(root, "planos-de-governo-sites-2026-08-15.7.tar.gz");
  const secondArchive = path.join(root, "planos-de-governo-sites-2026-08-15.7-second.tar.gz");
  const longRelativePath = path.join(
    "dist",
    "server",
    ...Array.from({ length: 6 }, (_, index) => `segmento-${index}-${"x".repeat(40)}`),
    "artefato.js",
  );
  await mkdir(path.join(root, path.dirname(longRelativePath)), { recursive: true });
  await writeFile(path.join(root, longRelativePath), "export const caminhoLongo = true;\n");
  await execFileAsync("bash", [packageScript, root, archive]);
  await writeFile(path.join(root, "dist/server/index.js"), "export default {};\n");
  await execFileAsync("bash", [packageScript, root, secondArchive]);

  assert.deepEqual(await readFile(archive), await readFile(secondArchive), "bundle varia com mtime ou ordem");

  const { stdout: entries } = await execFileAsync("tar", ["-tzf", archive]);
  assert.match(entries, /^dist\/server\/index\.js$/m);
  assert.match(entries, /^dist\/\.openai\/hosting\.json$/m);
  assert.ok(entries.split("\n").includes(longRelativePath.split(path.sep).join("/")));
  const { stdout: archivedHosting } = await execFileAsync(
    "tar",
    ["-xOzf", archive, "dist/.openai/hosting.json"],
  );
  assert.deepEqual(JSON.parse(archivedHosting), hosting);
  const { stdout: longArtifact } = await execFileAsync(
    "tar",
    ["-xOzf", archive, longRelativePath.split(path.sep).join("/")],
  );
  assert.equal(longArtifact, "export const caminhoLongo = true;\n");
});

test("handoff vincula bundle, manifesto, metodologia, tag e commit exatos", async (t) => {
  const { root } = await fixture(t);
  const archive = path.join(root, "planos-de-governo-sites-2026-08-15.7.tar.gz");
  const handoffPath = path.join(root, "sites-handoff-2026-08-15.7.json");
  await execFileAsync("bash", [packageScript, root, archive]);
  const handoff = await createSitesHandoff({
    root,
    tag: "dados-2026-08-15.7",
    commit,
    archive,
  });
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);

  assert.equal((await verifySitesHandoff({ root, handoff: handoffPath, expectedCommit: commit })).commit, commit);
  assert.equal(handoff.snapshotId, "2026-08-15.7");
  assert.match(handoff.archiveSha256, /^[a-f0-9]{64}$/);
  assert.match(handoff.manifestSha256, /^[a-f0-9]{64}$/);

  await writeFile(archive, Buffer.concat([await readFile(archive), Buffer.from("alterado")]));
  await assert.rejects(
    verifySitesHandoff({ root, handoff: handoffPath, expectedCommit: commit }),
    /hash do bundle diverge/,
  );
});
