#!/usr/bin/env node
import { lstat, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function cleanBuildOutput(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const output = resolve(resolvedRoot, "dist");
  if (relative(resolvedRoot, output) !== "dist") {
    throw new Error(`diretório de build inesperado: ${output}`);
  }

  try {
    const metadata = await lstat(output);
    if (metadata.isSymbolicLink()) throw new Error(`diretório de build não pode ser link simbólico: ${output}`);
  } catch (error) {
    if (error.code === "ENOENT") return { removed: false, output };
    throw error;
  }

  await rm(output, { recursive: true, force: true });
  return { removed: true, output };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanBuildOutput().then(({ removed }) => {
    console.log(`BUILD_OUTPUT_CLEAN: dist ${removed ? "removido" : "já ausente"}`);
  }).catch((error) => {
    console.error(`BUILD_OUTPUT_CLEAN_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
