#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const STATE_MARKER = "<!-- tse-monitor-state:v1 -->";
const CADENCES = new Set(["hourly", "daily", "weekly"]);
const RESULTS = new Set(["unknown", "stable", "changed", "divergent", "pending_official_status"]);
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

function parseArgs(argv) {
  const parsed = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      parsed.positional.push(argument);
      continue;
    }
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) parsed[key] = true;
    else parsed[key] = argv[++index];
  }
  return parsed;
}

function normalizedInstant(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function requiredInstant(value, label) {
  const instant = normalizedInstant(value);
  if (!instant) throw new Error(`${label} deve ser uma data ISO válida`);
  return instant;
}

export function initialMonitorState({ cadence = "hourly" } = {}) {
  return {
    schemaVersion: 1,
    cadence: CADENCES.has(cadence) ? cadence : "hourly",
    stableSince: null,
    lastCheckAt: null,
    lastChangeAt: null,
    lastResult: "unknown",
    hasDivergence: false,
    hasPendingOfficialStatus: false,
  };
}

export function normalizeMonitorState(value = {}) {
  return {
    schemaVersion: 1,
    cadence: CADENCES.has(value.cadence) ? value.cadence : "hourly",
    stableSince: normalizedInstant(value.stableSince),
    lastCheckAt: normalizedInstant(value.lastCheckAt),
    lastChangeAt: normalizedInstant(value.lastChangeAt),
    lastResult: RESULTS.has(value.lastResult) ? value.lastResult : "unknown",
    hasDivergence: value.hasDivergence === true,
    hasPendingOfficialStatus: value.hasPendingOfficialStatus === true,
  };
}

export function monitorContextFromPublicData(manifest, candidacies) {
  const pendingPatterns = [
    /\bAGUARDANDO\b/,
    /\bPENDENTE\b/,
    /\bEM (?:JULGAMENTO|SUBSTITUICAO|RETIFICACAO)\b/,
    /\bCOM RECURSO\b/,
    /\bRECURSO EM\b/,
  ];
  const hasPendingOfficialStatus = (Array.isArray(candidacies) ? candidacies : []).some((candidate) => {
    const label = String(candidate?.officialStatus?.label ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleUpperCase("pt-BR");
    return pendingPatterns.some((pattern) => pattern.test(label));
  });
  return {
    hasDivergence: manifest?.sourceStatus === "divergent",
    hasPendingOfficialStatus,
  };
}

export function shouldRunSchedule({
  state,
  eventName,
  schedule,
  manualCadence = "automatic",
  hasDivergence = false,
  hasPendingOfficialStatus = false,
}) {
  const current = normalizeMonitorState(state);
  let requiredCadence = current.cadence;
  if (hasDivergence) requiredCadence = "hourly";
  else if (hasPendingOfficialStatus && requiredCadence === "weekly") requiredCadence = "daily";
  if (eventName === "workflow_dispatch") {
    let requestedCadence = CADENCES.has(manualCadence) ? manualCadence : requiredCadence;
    if (hasDivergence) requestedCadence = "hourly";
    else if (hasPendingOfficialStatus && requestedCadence === "weekly") requestedCadence = "daily";
    return {
      run: true,
      effectiveCadence: requestedCadence,
    };
  }
  const cadenceBySchedule = new Map([
    ["17 * * * *", "hourly"],
    ["37 06 * * *", "daily"],
    ["53 07 * * 1", "weekly"],
  ]);
  const scheduledCadence = cadenceBySchedule.get(schedule);
  if (!scheduledCadence) throw new Error(`agendamento desconhecido: ${schedule || "vazio"}`);
  return {
    run: scheduledCadence === requiredCadence,
    effectiveCadence: requiredCadence,
  };
}

export function transitionMonitorState({
  state,
  changed,
  now,
  hasDivergence = false,
  hasPendingOfficialStatus = false,
}) {
  const previous = normalizeMonitorState(state);
  const nowIso = requiredInstant(now, "now");
  const nowMilliseconds = new Date(nowIso).valueOf();

  if (changed || hasDivergence) {
    const nextResult = changed ? "changed" : "divergent";
    const event = changed
      ? previous.lastResult === "changed" && previous.cadence === "hourly"
        ? "source_changed_repeated"
        : "source_changed"
      : previous.lastResult === "divergent" && previous.cadence === "hourly"
        ? "divergence_pending_repeated"
        : "divergence_pending";
    const shouldComment = !event.endsWith("_repeated");
    return {
      state: {
        ...previous,
        cadence: "hourly",
        stableSince: null,
        lastCheckAt: nowIso,
        lastChangeAt: changed ? nowIso : previous.lastChangeAt,
        lastResult: nextResult,
        hasDivergence,
        hasPendingOfficialStatus,
      },
      event,
      previousCadence: previous.cadence,
      shouldComment,
      reason: changed
        ? "alteração oficial detectada; estabilidade reiniciada"
        : "divergência entre fontes ainda não foi conciliada",
    };
  }

  const parsedStableSince = normalizedInstant(previous.stableSince);
  const stableSinceMilliseconds = parsedStableSince ? new Date(parsedStableSince).valueOf() : NaN;
  const stableSinceIsUsable = Number.isFinite(stableSinceMilliseconds) && stableSinceMilliseconds <= nowMilliseconds;
  const stableSince = stableSinceIsUsable ? parsedStableSince : nowIso;
  const stableMilliseconds = nowMilliseconds - new Date(stableSince).valueOf();
  let cadence = stableMilliseconds >= 14 * DAY_MS
    ? "weekly"
    : stableMilliseconds >= 72 * HOUR_MS
      ? "daily"
      : "hourly";
  if (hasPendingOfficialStatus && cadence === "weekly") cadence = "daily";
  const stabilityStarted = !stableSinceIsUsable;
  const cadenceChanged = cadence !== previous.cadence;
  const event = stabilityStarted
    ? "stability_started"
    : cadenceChanged
      ? "cadence_changed"
      : hasPendingOfficialStatus && previous.lastResult !== "pending_official_status"
        ? "official_status_pending"
        : !hasPendingOfficialStatus && previous.lastResult === "pending_official_status"
          ? "official_status_cleared"
          : "stable_check";

  return {
    state: {
      ...previous,
      cadence,
      stableSince,
      lastCheckAt: nowIso,
      lastResult: hasPendingOfficialStatus ? "pending_official_status" : "stable",
      hasDivergence: false,
      hasPendingOfficialStatus,
    },
    event,
    previousCadence: previous.cadence,
    shouldComment: stabilityStarted || cadenceChanged || ["official_status_pending", "official_status_cleared"].includes(event),
    reason: stabilityStarted
      ? "primeira verificação estável após inicialização ou mudança"
      : cadenceChanged
        ? cadence === "daily"
          ? hasPendingOfficialStatus && stableMilliseconds >= 14 * DAY_MS
            ? "situação oficial pendente mantém a verificação diária"
            : "72 horas consecutivas sem mudança"
          : "14 dias consecutivos sem mudança"
        : event === "official_status_pending"
          ? "julgamento, substituição ou retificação oficial ainda pendente"
          : event === "official_status_cleared"
            ? "não há mais situação oficial pendente"
            : "fonte permanece estável",
  };
}

export function renderStateIssue(value) {
  const state = normalizeMonitorState(value?.state ?? value);
  return [
    STATE_MARKER,
    "# Estado automático do monitor TSE",
    "",
    "Esta issue é a fonte de verdade operacional da cadência. O workflow atualiza somente os campos abaixo e registra as transições em comentários; nenhum dado bruto ou conteúdo editorial é armazenado aqui.",
    "",
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    "",
    "Limiares: divergência mantém `hourly`; após a conciliação, `hourly` até 72 horas estáveis, `daily` até 14 dias e `weekly` somente sem situação oficial pendente. Qualquer alteração detectada redefine imediatamente o estado para `hourly`.",
    "",
  ].join("\n");
}

export function extractStateFromIssue(body) {
  if (!body.includes(STATE_MARKER)) throw new Error("marcador do estado do monitor ausente");
  const match = /```json\s*([\s\S]*?)\s*```/.exec(body);
  if (!match) throw new Error("bloco JSON do estado do monitor ausente");
  const parsed = JSON.parse(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("estado persistido deve ser um objeto JSON");
  }
  const expectedKeys = [
    "cadence",
    "hasDivergence",
    "hasPendingOfficialStatus",
    "lastChangeAt",
    "lastCheckAt",
    "lastResult",
    "schemaVersion",
    "stableSince",
  ];
  const actualKeys = Object.keys(parsed).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("campos do estado persistido estão ausentes ou são desconhecidos");
  }
  if (parsed.schemaVersion !== 1) throw new Error("versão do estado persistido inválida");
  if (!CADENCES.has(parsed.cadence)) throw new Error("cadência persistida inválida");
  if (!RESULTS.has(parsed.lastResult)) throw new Error("resultado persistido inválido");
  for (const key of ["stableSince", "lastCheckAt", "lastChangeAt"]) {
    if (parsed[key] !== null && normalizedInstant(parsed[key]) !== parsed[key]) {
      throw new Error(`${key} persistido deve ser uma data ISO canônica ou null`);
    }
  }
  if (typeof parsed.hasDivergence !== "boolean" || typeof parsed.hasPendingOfficialStatus !== "boolean") {
    throw new Error("indicadores persistidos devem ser booleanos");
  }
  return normalizeMonitorState(parsed);
}

export function renderTransitionComment(transition, runUrl) {
  const next = normalizeMonitorState(transition.state);
  const lines = [
    `Atualização automática em ${next.lastCheckAt}.`,
    "",
    `- Evento: \`${transition.event}\``,
    `- Cadência: \`${transition.previousCadence}\` → \`${next.cadence}\``,
    `- Motivo: ${transition.reason}`,
  ];
  if (runUrl) lines.push(`- Execução: ${runUrl}`);
  lines.push("", "Nenhum dado bruto do TSE foi anexado.");
  return `${lines.join("\n")}\n`;
}

async function readJsonFile(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function outputJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];
  if (command === "initial") {
    outputJson(initialMonitorState({ cadence: args.cadence }));
    return;
  }
  if (command === "extract") {
    let body = "";
    for await (const chunk of process.stdin) body += chunk;
    outputJson(extractStateFromIssue(body));
    return;
  }
  if (command === "gate") {
    const state = await readJsonFile(args.state);
    const result = shouldRunSchedule({
      state,
      eventName: args.event,
      schedule: args.schedule,
      manualCadence: args.manualCadence,
      hasDivergence: args.hasDivergence === "true",
      hasPendingOfficialStatus: args.hasPendingOfficialStatus === "true",
    });
    process.stdout.write(`run=${result.run}\neffective_cadence=${result.effectiveCadence}\n`);
    return;
  }
  if (command === "transition") {
    const state = await readJsonFile(args.state);
    outputJson(transitionMonitorState({
      state,
      changed: args.changed === "true",
      now: args.now,
      hasDivergence: args.hasDivergence === "true",
      hasPendingOfficialStatus: args.hasPendingOfficialStatus === "true",
    }));
    return;
  }
  if (command === "context") {
    const [manifest, candidacies] = await Promise.all([
      readJsonFile(args.manifest),
      readJsonFile(args.candidacies),
    ]);
    const context = monitorContextFromPublicData(manifest, candidacies);
    process.stdout.write(
      `has_divergence=${context.hasDivergence}\nhas_pending_official_status=${context.hasPendingOfficialStatus}\n`,
    );
    return;
  }
  if (command === "render") {
    process.stdout.write(renderStateIssue(await readJsonFile(args.state)));
    return;
  }
  if (command === "emit-transition") {
    const transition = await readJsonFile(args.state);
    const next = normalizeMonitorState(transition.state);
    process.stdout.write([
      `cadence=${next.cadence}`,
      `event=${transition.event}`,
      `should_comment=${transition.shouldComment}`,
      `stable_since=${next.stableSince ?? ""}`,
      `last_check_at=${next.lastCheckAt ?? ""}`,
    ].join("\n") + "\n");
    return;
  }
  if (command === "comment") {
    process.stdout.write(renderTransitionComment(await readJsonFile(args.state), args.runUrl));
    return;
  }
  throw new Error(`comando inválido: ${command ?? "ausente"}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`TSE_MONITOR_STATE_ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
