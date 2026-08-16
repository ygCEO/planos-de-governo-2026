import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanBuildOutput } from "../scripts/build/clean-output.mjs";

test("limpeza do build remove apenas dist e preserva arquivos do projeto", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "planos-build-clean-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "dist", "client", "dados", "snapshots", "obsoleto"), { recursive: true });
  await writeFile(path.join(root, "dist", "client", "dados", "snapshots", "obsoleto", "manifest.json"), "{}\n");
  await writeFile(path.join(root, "preservar.txt"), "conteúdo editorial\n");

  const result = await cleanBuildOutput(root);
  assert.equal(result.removed, true);
  await assert.rejects(access(path.join(root, "dist")));
  await access(path.join(root, "preservar.txt"));

  assert.equal((await cleanBuildOutput(root)).removed, false);
});
