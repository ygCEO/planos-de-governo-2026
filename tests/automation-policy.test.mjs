import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const execFileAsync = promisify(execFile);

function workflowRunBlock(workflow, stepName) {
  const lines = workflow.split("\n");
  const nameIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.ok(nameIndex >= 0, `step ausente: ${stepName}`);
  const runIndex = lines.findIndex((line, index) => index > nameIndex && line.trim() === "run: |");
  assert.ok(runIndex > nameIndex, `bloco run ausente: ${stepName}`);
  const runIndent = lines[runIndex].match(/^\s*/)[0].length;
  const body = [];
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.match(/^\s*/)[0].length;
    if (line.trim() && indent <= runIndent) break;
    body.push(line.slice(Math.min(line.length, runIndent + 2)));
  }
  return body.join("\n");
}

test("CI aplica validação, reprodução, lint, build e testes com privilégios mínimos", async () => {
  const [workflow, packageDocument] = await Promise.all([
    read(".github/workflows/validate-build.yml"),
    read("package.json"),
  ]);
  const packageJson = JSON.parse(packageDocument);

  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /actions\/checkout@v4\s*\n\s+with:\s*\n\s+fetch-depth: 0/);
  assert.match(workflow, /timeout-minutes:\s*20/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.doesNotMatch(workflow, /npm audit[^\n]*--omit=dev/);
  assert.match(workflow, /node scripts\/data\/validate\.mjs/);
  assert.match(workflow, /node scripts\/data\/regression-checks\.mjs/);
  assert.match(workflow, /node scripts\/data\/build-snapshot\.mjs/);
  assert.match(workflow, /git status --porcelain --untracked-files=all -- public\/dados/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.doesNotMatch(workflow, /pull_request_target|contents:\s*write/i);
  assert.match(packageJson.scripts.build, /^node scripts\/build\/clean-output\.mjs && /);
  assert.match(packageJson.scripts["test:audit"], /^node scripts\/data\/regression-checks\.mjs && /);
  assert.match(packageJson.scripts.ci, /npm run test:audit/);
});

test("monitor transiciona as três cadências com estado auditável e sem dados brutos", async () => {
  const [workflow, stateMachine] = await Promise.all([
    read(".github/workflows/tse-monitor.yml"),
    read(".github/scripts/tse-monitor-state.mjs"),
  ]);

  for (const schedule of ["17 * * * *", "37 06 * * *", "53 07 * * 1"]) {
    assert.ok(workflow.includes(schedule), `agenda ausente: ${schedule}`);
  }

  assert.match(workflow, /TSE_MONITOR_CADENCE/);
  assert.match(workflow, /Estado automático do monitor TSE/);
  assert.match(workflow, /item\.author\?\.login === "github-actions\[bot\]"/);
  assert.match(workflow, /tse-monitor-state\.mjs context/);
  assert.match(workflow, /--has-divergence "\$HAS_DIVERGENCE"/);
  assert.match(workflow, /--has-pending-official-status "\$HAS_PENDING_OFFICIAL_STATUS"/);
  assert.match(workflow, /node \.github\/scripts\/tse-monitor-state\.mjs gate/);
  assert.match(workflow, /node \.github\/scripts\/tse-monitor-state\.mjs transition/);
  assert.match(workflow, /gh issue edit/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh variable set TSE_MONITOR_CADENCE/);
  assert.match(workflow, /secrets\.TSE_MONITOR_VARIABLE_TOKEN/);
  assert.match(stateMachine, /72 \* HOUR_MS/);
  assert.match(stateMachine, /14 \* DAY_MS/);
  assert.match(stateMachine, /cadence: "hourly"/);
  const syncCommands = workflow.match(/node scripts\/tse\/sync-metadata\.mjs[^\n]*/g) ?? [];
  assert.equal(syncCommands.length, 1);
  assert.match(syncCommands[0], /--check(?:\s|$)/);
  assert.match(workflow, /source_changed/);
  assert.match(workflow, /Não cole CPF, título eleitoral/);
  assert.match(workflow, /gh issue create/);
  assert.ok(workflow.indexOf("Persistir estado e registrar transições") < workflow.indexOf("Falhar de forma visível"));
  assert.doesNotMatch(workflow, /upload-artifact|pull_request_target|contents:\s*write/i);
});

test("busca da issue de estado entrega o título em um único argumento", async (t) => {
  const workflow = await read(".github/workflows/tse-monitor.yml");
  const commandLine = workflow
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith('issues_json="$(gh issue list'));
  assert.ok(commandLine, "busca da issue de estado ausente");

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-state-workflow-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const trace = path.join(temporaryRoot, "args.txt");
  const script = path.join(temporaryRoot, "check.sh");
  await writeFile(
    script,
    [
      "set -euo pipefail",
      `TRACE=${JSON.stringify(trace)}`,
      'gh() { printf \'%s\\n\' "$@" > "$TRACE"; printf \'[]\'; }',
      'STATE_TITLE="Estado automático do monitor TSE"',
      commandLine,
    ].join("\n"),
  );
  await execFileAsync("bash", [script]);
  const args = (await readFile(trace, "utf8")).trimEnd().split("\n");
  const searchIndex = args.indexOf("--search");
  assert.ok(searchIndex >= 0);
  assert.equal(args[searchIndex + 1], "Estado automático do monitor TSE in:title");
  assert.equal(args[searchIndex + 2], "--limit");
});

test("gate real inicializa a issue e ativa somente a agenda horária", async (t) => {
  const workflow = await read(".github/workflows/tse-monitor.yml");
  const runBlock = workflowRunBlock(workflow, "Recuperar estado auditável e selecionar a agenda");
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-state-gate-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const output = path.join(temporaryRoot, "github-output.txt");
  const script = path.join(temporaryRoot, "gate.sh");
  await writeFile(
    script,
    [
      "gh() {",
      "  if [[ \"$1 $2\" == \"issue list\" ]]; then printf '[]'; return; fi",
      "  if [[ \"$1 $2\" == \"issue create\" ]]; then printf 'https://github.test/o/r/issues/42\\n'; return; fi",
      "  return 91",
      "}",
      runBlock,
    ].join("\n"),
  );
  await execFileAsync("bash", [script], {
    cwd: projectRoot,
    env: {
      ...process.env,
      RUNNER_TEMP: temporaryRoot,
      GITHUB_OUTPUT: output,
      EVENT_NAME: "schedule",
      SCHEDULE: "17 * * * *",
      MANUAL_CADENCE: "automatic",
      BOOTSTRAP_CADENCE: "hourly",
      HAS_DIVERGENCE: "false",
      HAS_PENDING_OFFICIAL_STATUS: "false",
      STATE_TITLE: "Estado automático do monitor TSE",
    },
  });
  const outputs = await readFile(output, "utf8");
  assert.match(outputs, /^run=true$/m);
  assert.match(outputs, /^effective_cadence=hourly$/m);
  assert.match(outputs, /^issue_number=42$/m);
});

test("deduplicação do alerta entrega a busca do gh em um único argumento", async (t) => {
  const workflow = await read(".github/workflows/tse-monitor.yml");
  const commandLine = workflow
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith('alerts_json="$(gh issue list'));
  assert.ok(commandLine, "comando de deduplicação ausente");

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-workflow-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const trace = path.join(temporaryRoot, "args.txt");
  const script = path.join(temporaryRoot, "check.sh");
  await writeFile(
    script,
    [
      "set -euo pipefail",
      `TRACE=${JSON.stringify(trace)}`,
      'gh() { printf \'%s\\n\' "$@" > "$TRACE"; printf \'[]\'; }',
      'title="Monitoramento TSE detectou alteração oficial"',
      commandLine,
    ].join("\n"),
  );
  await execFileAsync("bash", [script]);
  const args = (await readFile(trace, "utf8")).trimEnd().split("\n");

  const searchIndex = args.indexOf("--search");
  assert.ok(searchIndex >= 0);
  assert.equal(args[searchIndex + 1], "Monitoramento TSE detectou alteração oficial in:title");
  assert.equal(args[searchIndex + 2], "--limit");
});

test("formulário de correção exige fonte, página e confirmação de privacidade", async () => {
  const form = await read(".github/ISSUE_TEMPLATE/correcao.yml");

  for (const id of [
    "affected_url",
    "official_source",
    "page_reference",
    "current_content",
    "requested_correction",
    "privacy_confirmation",
    "source_confirmation",
  ]) {
    assert.match(form, new RegExp(`id: ${id}\\b`));
  }

  assert.match(form, /Não inclua CPF, título eleitoral/);
  assert.match(form, /required: true/g);
  assert.match(form, /documento oficial do TSE, não em material de campanha/i);
});

test("preservação usa o binding gerenciado pelo Sites e abre mudança revisável", async () => {
  const workflow = await read(".github/workflows/preserve-pdfs.yml");

  assert.match(workflow, /actions\/checkout@v4\s*\n\s+with:\s*\n\s+fetch-depth: 0/);
  assert.match(workflow, /default: true\s*\n\s*type: boolean/);
  assert.match(workflow, /PDF_UPLOAD_ORIGIN: \$\{\{ vars\.PDF_UPLOAD_ORIGIN \}\}/);
  assert.match(workflow, /PDF_UPLOAD_TOKEN: \$\{\{ secrets\.PDF_UPLOAD_TOKEN \}\}/);
  assert.match(workflow, /node scripts\/tse\/stage-pdfs\.mjs/);
  assert.match(workflow, /node scripts\/tse\/upload-pdfs\.mjs/);
  assert.match(workflow, /node scripts\/tse\/mark-pdfs-preserved\.mjs/);
  assert.match(workflow, /node scripts\/data\/regression-checks\.mjs/);
  assert.match(workflow, /--origin "\$PDF_UPLOAD_ORIGIN"/);
  assert.match(workflow, /gh pr create/);
  assert.doesNotMatch(
    workflow,
    /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|R2_BUCKET_NAME|wrangler r2 object/i,
  );
});

test("release exige tags SSH verificadas antes de publicar o bundle", async () => {
  const [workflow, packager] = await Promise.all([
    read(".github/workflows/release-snapshot.yml"),
    read(".github/scripts/package-site.sh"),
  ]);
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));

  assert.match(workflow, /git verify-tag metodologia-v1\.0/);
  assert.match(workflow, /git verify-tag "\$tag"/);
  assert.match(workflow, /git fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.match(workflow, /git merge-base --is-ancestor "\$tag\^\{commit\}" refs\/remotes\/origin\/main/);
  assert.match(workflow, /A tag de dados não pertence à história protegida de main/);
  assert.match(workflow, /import \{ readYaml \} from "\.\/scripts\/lib\/io\.mjs"/);
  assert.doesNotMatch(workflow, /require\([^\n]*\.yaml/);
  assert.match(workflow, /node scripts\/data\/build-snapshot\.mjs --check/);
  assert.match(workflow, /node scripts\/data\/regression-checks\.mjs/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.doesNotMatch(workflow, /npm audit[^\n]*--omit=dev/);
  assert.match(workflow, /dpkg --compare-versions "\$installed_version" ge 2\.97\.0/);
  assert.match(workflow, /GitHub CLI \$installed_version é vulnerável/);
  assert.match(workflow, /bash \.github\/scripts\/package-site\.sh/);
  assert.match(workflow, /sites-handoff\.mjs create/);
  assert.match(workflow, /sites-handoff\.mjs verify/);
  assert.match(workflow, /verify-release-assets\.mjs/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /uses: actions\/attest@v4/);
  assert.match(workflow, /subject-path: \$\{\{ github\.workspace \}\}\/planos-de-governo-sites-\$\{\{ steps\.release\.outputs\.snapshot \}\}\.tar\.gz/);
  assert.match(workflow, /gh attestation verify "\$archive"/);
  assert.match(workflow, /--repo "\$GH_REPO"/);
  assert.match(workflow, /--signer-workflow "\$GH_REPO\/\.github\/workflows\/release-snapshot\.yml"/);
  assert.match(workflow, /--source-ref "refs\/tags\/\$TAG"/);
  assert.match(workflow, /--source-digest "\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /--deny-self-hosted-runners/);
  assert.match(workflow, /--json isImmutable --jq '\.isImmutable'/);
  assert.match(workflow, /gh release verify "\$TAG"/);
  assert.match(workflow, /gh release verify-asset "\$TAG" "\$asset"/);
  assert.match(workflow, /A primeira publicação deve ser disparada pela tag assinada/);
  assert.match(workflow, /sites-handoff-\$\{SNAPSHOT\}\.json/);
  assert.match(workflow, /gh release download "\$TAG"/);
  assert.match(workflow, /if: steps\.published\.outputs\.exists != 'true'/);
  assert.doesNotMatch(workflow, /gh release upload|--clobber|cmp --silent/);
  assert.match(workflow, /gh release create "\$TAG"/);
  assert.match(workflow, /--verify-tag/);
  assert.doesNotMatch(workflow, /git tag\s|git push[^\n]*--tags/);
  assert.match(
    workflow,
    /group: release-snapshot-\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.tag \|\| github\.ref_name \}\}/,
  );
  assert.match(packager, /dist\/server\/index\.js/);
  assert.match(packager, /dist\/\.openai\/hosting\.json/);
  assert.match(packager, /cp "\$hosting" "\$stage\/dist\/\.openai\/hosting\.json"/);

  await execFileAsync(
    "git",
    [
      "-c",
      `gpg.ssh.allowedSignersFile=${path.join(projectRoot, ".github/release-signers")}`,
      "verify-tag",
      "metodologia-v1.0",
    ],
    { cwd: projectRoot },
  );

  const { stdout: methodologyCommit } = await execFileAsync(
    "node",
    [
      "--input-type=module",
      "-e",
      'import { readYaml } from "./scripts/lib/io.mjs"; const m = await readYaml("./content/releases/metodologia.yaml"); process.stdout.write(m.commit)',
    ],
    { cwd: projectRoot },
  );
  const { stdout: taggedCommit } = await execFileAsync(
    "git",
    ["rev-parse", "metodologia-v1.0^{commit}"],
    { cwd: projectRoot },
  );
  assert.equal(methodologyCommit, taggedCommit.trim());
});

test("reexecução valida os assets publicados e termina sem mutação", async (t) => {
  const workflow = await read(".github/workflows/release-snapshot.yml");
  const recoverBlock = workflowRunBlock(workflow, "Recuperar release existente e validar imutabilidade");
  const provenanceBlock = workflowRunBlock(workflow, "Verificar proveniência do bundle produtor");
  const verifyBlock = workflowRunBlock(workflow, "Verificar release imutável e seus três assets");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-release-rerun-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const existingRoot = path.join(temporaryRoot, "published");
  const summary = path.join(temporaryRoot, "summary.md");
  const output = path.join(temporaryRoot, "github-output.txt");
  const trace = path.join(temporaryRoot, "gh-args.txt");
  const snapshot = "2026-08-15.7";
  const archiveName = `planos-de-governo-sites-${snapshot}.tar.gz`;
  const checksumName = `${archiveName}.sha256`;
  const handoffName = `sites-handoff-${snapshot}.json`;
  await mkdir(existingRoot, { recursive: true });
  const assets = new Map([
    [archiveName, "bundle-imutável\n"],
    [checksumName, `hash  ${archiveName}\n`],
    [handoffName, '{"schemaVersion":"1.0"}\n'],
  ]);
  for (const [filename, contents] of assets) {
    await writeFile(path.join(existingRoot, filename), contents);
  }

  const script = path.join(temporaryRoot, "release.sh");
  await writeFile(script, [
    "gh() {",
    "  printf '%s\\n' \"$*\" >> \"$TRACE\"",
    "  if [[ \"$1 $2\" == \"release view\" ]]; then",
    "    if [[ \"$*\" == *\"--json isImmutable\"* ]]; then printf 'true\\n'; fi",
    "    return 0",
    "  fi",
    "  if [[ \"$1 $2\" == \"release download\" ]]; then",
    "    shift 2",
    "    local destination=''",
    "    while (($#)); do",
    "      if [[ \"$1\" == \"--dir\" ]]; then destination=\"$2\"; shift 2; else shift; fi",
    "    done",
    "    cp \"$EXISTING_ROOT/$ARCHIVE_NAME\" \"$destination/$ARCHIVE_NAME\"",
    "    cp \"$EXISTING_ROOT/$CHECKSUM_NAME\" \"$destination/$CHECKSUM_NAME\"",
    "    cp \"$EXISTING_ROOT/$HANDOFF_NAME\" \"$destination/$HANDOFF_NAME\"",
    "    return 0",
    "  fi",
    "  if [[ \"$1 $2\" == \"attestation verify\" ]]; then [[ \"${ATTESTATION_OK:-true}\" == \"true\" ]]; return; fi",
    "  if [[ \"$1 $2\" == \"release verify\" || \"$1 $2\" == \"release verify-asset\" ]]; then return 0; fi",
    "  return 97",
    "}",
    "sleep() { return 0; }",
    "node() { printf 'node %s\\n' \"$*\" >> \"$TRACE\"; return 0; }",
    "git() { printf '%s\\n' \"${EXPECTED_COMMIT}\"; }",
    recoverBlock,
    provenanceBlock,
    verifyBlock,
  ].join("\n"));
  const env = {
    ...process.env,
    TRACE: trace,
    EXISTING_ROOT: existingRoot,
    ARCHIVE_NAME: archiveName,
    CHECKSUM_NAME: checksumName,
    HANDOFF_NAME: handoffName,
    GITHUB_STEP_SUMMARY: summary,
    GITHUB_OUTPUT: output,
    EXPECTED_COMMIT: "a".repeat(40),
    ATTESTATION_OK: "true",
    GH_REPO: "exemplo/planos-de-governo-2026",
    EVENT_NAME: "workflow_dispatch",
    EXISTING: "true",
    TAG: `dados-${snapshot}`,
    SNAPSHOT: snapshot,
  };

  await execFileAsync("bash", [script], { cwd: temporaryRoot, env });
  assert.match(await readFile(summary, "utf8"), /reexecução concluída sem mutação/);
  assert.match(await readFile(output, "utf8"), /^exists=true$/m);
  const calls = await readFile(trace, "utf8");
  assert.match(calls, /release download/);
  assert.match(
    calls,
    new RegExp(
      `attestation verify ${archiveName} --repo exemplo/planos-de-governo-2026 `
      + `--signer-workflow exemplo/planos-de-governo-2026/\\.github/workflows/release-snapshot\\.yml `
      + `--source-ref refs/tags/dados-${snapshot.replaceAll(".", "\\.")} `
      + `--source-digest ${"a".repeat(40)} --deny-self-hosted-runners`,
    ),
  );
  assert.match(calls, /release verify dados-2026-08-15\.7/);
  assert.equal((calls.match(/release verify-asset/g) ?? []).length, 3);
  assert.match(calls, /node \.github\/scripts\/verify-release-assets\.mjs/);
  assert.doesNotMatch(calls, /release (?:create|upload)/);
  assert.ok(
    workflow.indexOf("Recuperar release existente e validar imutabilidade")
      < workflow.indexOf("Empacotar bundle compatível e criar handoff verificável"),
  );

  await writeFile(trace, "");
  await assert.rejects(
    execFileAsync("bash", [script], {
      cwd: temporaryRoot,
      env: { ...env, ATTESTATION_OK: "false" },
    }),
    (error) => {
      assert.match(error.stderr, /A proveniência do bundle não corresponde ao workflow, tag e commit esperados/);
      return true;
    },
  );
  const rejectedCalls = await readFile(trace, "utf8");
  assert.equal((rejectedCalls.match(/attestation verify/g) ?? []).length, 6);
  assert.doesNotMatch(rejectedCalls, /release verify dados-/);
});
