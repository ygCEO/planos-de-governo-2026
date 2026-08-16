import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  extractStateFromIssue,
  initialMonitorState,
  monitorContextFromPublicData,
  renderStateIssue,
  renderTransitionComment,
  shouldRunSchedule,
  transitionMonitorState,
} from "../.github/scripts/tse-monitor-state.mjs";

const start = "2026-08-15T12:00:00.000Z";
const execFileAsync = promisify(execFile);
const stateScript = fileURLToPath(new URL("../.github/scripts/tse-monitor-state.mjs", import.meta.url));

function after(hours) {
  return new Date(new Date(start).valueOf() + hours * 60 * 60 * 1_000).toISOString();
}

test("somente a agenda correspondente ao estado executa, mas despacho manual sempre executa", () => {
  const state = { ...initialMonitorState(), cadence: "daily" };
  assert.deepEqual(
    shouldRunSchedule({ state, eventName: "schedule", schedule: "17 * * * *" }),
    { run: false, effectiveCadence: "daily" },
  );
  assert.deepEqual(
    shouldRunSchedule({ state, eventName: "schedule", schedule: "37 06 * * *" }),
    { run: true, effectiveCadence: "daily" },
  );
  assert.deepEqual(
    shouldRunSchedule({ state, eventName: "workflow_dispatch", schedule: "", manualCadence: "hourly" }),
    { run: true, effectiveCadence: "hourly" },
  );
  assert.throws(
    () => shouldRunSchedule({ state, eventName: "schedule", schedule: "0 0 * * *" }),
    /agendamento desconhecido/,
  );
});

test("transiciona hourly para daily após 72 horas e para weekly após 14 dias", () => {
  const first = transitionMonitorState({ state: initialMonitorState(), changed: false, now: start });
  assert.equal(first.state.cadence, "hourly");
  assert.equal(first.state.stableSince, start);
  assert.equal(first.event, "stability_started");

  const beforeDaily = transitionMonitorState({ state: first.state, changed: false, now: after(71) });
  assert.equal(beforeDaily.state.cadence, "hourly");
  assert.equal(beforeDaily.event, "stable_check");

  const daily = transitionMonitorState({ state: beforeDaily.state, changed: false, now: after(72) });
  assert.equal(daily.state.cadence, "daily");
  assert.equal(daily.event, "cadence_changed");
  assert.match(daily.reason, /72 horas/);

  const beforeWeekly = transitionMonitorState({ state: daily.state, changed: false, now: after(14 * 24 - 1) });
  assert.equal(beforeWeekly.state.cadence, "daily");

  const weekly = transitionMonitorState({ state: beforeWeekly.state, changed: false, now: after(14 * 24) });
  assert.equal(weekly.state.cadence, "weekly");
  assert.equal(weekly.event, "cadence_changed");
  assert.match(weekly.reason, /14 dias/);
});

test("qualquer alteração redefine weekly para hourly e reinicia a estabilidade", () => {
  const weeklyState = {
    ...initialMonitorState(),
    cadence: "weekly",
    stableSince: start,
    lastCheckAt: after(14 * 24),
    lastResult: "stable",
  };
  const changed = transitionMonitorState({ state: weeklyState, changed: true, now: after(15 * 24) });

  assert.equal(changed.state.cadence, "hourly");
  assert.equal(changed.state.stableSince, null);
  assert.equal(changed.state.lastChangeAt, after(15 * 24));
  assert.equal(changed.event, "source_changed");
  assert.equal(changed.shouldComment, true);

  const repeated = transitionMonitorState({ state: changed.state, changed: true, now: after(15 * 24 + 1) });
  assert.equal(repeated.state.cadence, "hourly");
  assert.equal(repeated.event, "source_changed_repeated");
  assert.equal(repeated.shouldComment, false);

  const reconciled = transitionMonitorState({ state: repeated.state, changed: false, now: after(15 * 24 + 2) });
  assert.equal(reconciled.state.stableSince, after(15 * 24 + 2));
  assert.equal(reconciled.event, "stability_started");
});

test("divergência persistente força hourly mesmo sem nova diferença", () => {
  const staleWeekly = {
    ...initialMonitorState(),
    cadence: "weekly",
    stableSince: start,
    lastResult: "stable",
  };
  const gate = shouldRunSchedule({
    state: staleWeekly,
    eventName: "schedule",
    schedule: "17 * * * *",
    hasDivergence: true,
  });
  const transition = transitionMonitorState({
    state: staleWeekly,
    changed: false,
    now: after(30 * 24),
    hasDivergence: true,
  });

  assert.deepEqual(gate, { run: true, effectiveCadence: "hourly" });
  assert.equal(transition.state.cadence, "hourly");
  assert.equal(transition.state.stableSince, null);
  assert.equal(transition.state.lastResult, "divergent");
  assert.equal(transition.event, "divergence_pending");
});

test("situação oficial pendente impede weekly, mas permite daily após 72 horas", () => {
  const stableForThirtyDays = {
    ...initialMonitorState(),
    cadence: "daily",
    stableSince: start,
    lastResult: "pending_official_status",
    hasPendingOfficialStatus: true,
  };
  const transition = transitionMonitorState({
    state: stableForThirtyDays,
    changed: false,
    now: after(30 * 24),
    hasPendingOfficialStatus: true,
  });
  const staleWeeklyTransition = transitionMonitorState({
    state: { ...stableForThirtyDays, cadence: "weekly" },
    changed: false,
    now: after(30 * 24),
    hasPendingOfficialStatus: true,
  });
  const dailyGate = shouldRunSchedule({
    state: { ...stableForThirtyDays, cadence: "weekly" },
    eventName: "schedule",
    schedule: "37 06 * * *",
    hasPendingOfficialStatus: true,
  });
  const weeklyGate = shouldRunSchedule({
    state: { ...stableForThirtyDays, cadence: "weekly" },
    eventName: "schedule",
    schedule: "53 07 * * 1",
    hasPendingOfficialStatus: true,
  });

  assert.equal(transition.state.cadence, "daily");
  assert.equal(transition.state.lastResult, "pending_official_status");
  assert.equal(staleWeeklyTransition.state.cadence, "daily");
  assert.match(staleWeeklyTransition.reason, /situação oficial pendente/);
  assert.deepEqual(dailyGate, { run: true, effectiveCadence: "daily" });
  assert.deepEqual(weeklyGate, { run: false, effectiveCadence: "daily" });
});

test("contexto público detecta divergência e julgamento sem copiar dados da fonte", () => {
  const context = monitorContextFromPublicData(
    { sourceStatus: "divergent" },
    [{ officialStatus: { label: "Aguardando julgamento" } }],
  );
  const settled = monitorContextFromPublicData(
    { sourceStatus: "stable" },
    [
      { officialStatus: { label: "Apto" } },
      { officialStatus: { label: "Substituído" } },
      { officialStatus: { label: "Pedido retificado" } },
    ],
  );

  assert.deepEqual(context, { hasDivergence: true, hasPendingOfficialStatus: true });
  assert.deepEqual(settled, { hasDivergence: false, hasPendingOfficialStatus: false });
});

test("issue de estado é reproduzível e não inclui resposta bruta da fonte", () => {
  const transition = transitionMonitorState({ state: initialMonitorState(), changed: false, now: start });
  const body = renderStateIssue(transition);
  const restored = extractStateFromIssue(body);
  const comment = renderTransitionComment(transition, "https://github.example/actions/runs/1");

  assert.deepEqual(restored, transition.state);
  assert.match(body, /tse-monitor-state:v1/);
  assert.match(body, /fonte de verdade operacional/);
  assert.doesNotMatch(body, /CPF|arquivo ZIP|resposta REST/i);
  assert.match(comment, /Nenhum dado bruto do TSE foi anexado/);
  assert.match(comment, /https:\/\/github\.example\/actions\/runs\/1/);
});

test("issue de estado corrompida falha sem reiniciar silenciosamente a cadência", () => {
  const valid = JSON.parse(JSON.stringify(initialMonitorState()));
  const issue = (state) => [
    "<!-- tse-monitor-state:v1 -->",
    "```json",
    JSON.stringify(state),
    "```",
  ].join("\n");

  assert.throws(
    () => extractStateFromIssue(issue({ ...valid, cadence: "sometimes" })),
    /cadência persistida inválida/,
  );
  assert.throws(
    () => extractStateFromIssue(issue({ ...valid, stableSince: "ontem" })),
    /stableSince persistido/,
  );
  assert.throws(
    () => extractStateFromIssue(issue({ ...valid, respostaBruta: "não deve existir" })),
    /campos do estado persistido/,
  );
});

test("interface de linha de comando usada pelo workflow emite outputs executáveis", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "planos-monitor-state-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const stateFile = path.join(temporaryRoot, "state.json");
  const transitionFile = path.join(temporaryRoot, "transition.json");
  await writeFile(stateFile, JSON.stringify(initialMonitorState()));

  const { stdout: gate } = await execFileAsync("node", [
    stateScript,
    "gate",
    "--state",
    stateFile,
    "--event",
    "schedule",
    "--schedule",
    "17 * * * *",
  ]);
  assert.equal(gate, "run=true\neffective_cadence=hourly\n");

  const { stdout: transitionJson } = await execFileAsync("node", [
    stateScript,
    "transition",
    "--state",
    stateFile,
    "--changed",
    "false",
    "--now",
    start,
  ]);
  await writeFile(transitionFile, transitionJson);
  const { stdout: outputs } = await execFileAsync("node", [
    stateScript,
    "emit-transition",
    "--state",
    transitionFile,
  ]);
  assert.match(outputs, /^cadence=hourly$/m);
  assert.match(outputs, /^event=stability_started$/m);
  assert.match(outputs, /^should_comment=true$/m);
});
