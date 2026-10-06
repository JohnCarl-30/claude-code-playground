import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { claudeEnv } from "./auth";
import { ensurePracticeApi, mockApiEnv } from "./practice-api";
import { API_PORT, findTemplate } from "./templates";
import { WORKSPACE_DIR, currentTemplate, ensureWorkspace } from "./workspace";

// One program at a time, started from the Run & test panel. Only the scripts
// a starter declares in templates.ts can run; there is no free-form command.

export type ProcessStatus = {
  script: string | null;
  running: boolean;
  exitCode: number | null;
  logs: string[];
};

type State = { child: ChildProcess | null; status: ProcessStatus; exitHook?: boolean };
const g = globalThis as unknown as { __playgroundProcess?: State };
const state = (g.__playgroundProcess ??= { child: null, status: { script: null, running: false, exitCode: null, logs: [] } });

const MAX_LINES = 400;

// Don't leave an API server running after the playground itself stops.
if (!state.exitHook) {
  state.exitHook = true;
  process.once("exit", () => state.child?.kill());
}

function log(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  state.status.logs.push(...lines);
  if (state.status.logs.length > MAX_LINES) state.status.logs.splice(0, state.status.logs.length - MAX_LINES);
}

export function getProcessStatus(): ProcessStatus {
  return { ...state.status, logs: [...state.status.logs] };
}

export async function stopProcess() {
  const child = state.child;
  // A program stopped by a signal has signalCode set and exitCode null.
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export async function startProcess(scriptId: string): Promise<ProcessStatus | string> {
  await ensureWorkspace();
  const template = findTemplate(await currentTemplate());
  const script = template?.scripts.find((s) => s.id === scriptId);
  if (!template || !script) return `"${scriptId}" isn't a script of this starter.`;

  await stopProcess();

  // Agent scripts sign in the same way the playground does (login, or your key if you opted in).
  const env: NodeJS.ProcessEnv = { ...claudeEnv(), PORT: String(API_PORT), FORCE_COLOR: "0" };
  // Claude API programs talk to the practice API instead, so they never need (or see) a real key.
  let practice: Awaited<ReturnType<typeof ensurePracticeApi>> | null = null;
  if (script.practiceApi) {
    practice = await ensurePracticeApi();
    for (const k of Object.keys(env)) if (k.startsWith("ANTHROPIC_")) delete env[k];
    Object.assign(env, mockApiEnv(practice.url), { POLL_MS: "500" });
  }

  const [program, ...args] = script.command;
  const child = spawn(program === "node" ? process.execPath : program, args, { cwd: WORKSPACE_DIR, env });
  state.child = child;
  state.status = { script: script.id, running: true, exitCode: null, logs: [`$ ${script.command.join(" ")}`] };

  if (practice) {
    log(`(practice API at ${practice.url}: canned replies in the real API's shapes, not Claude)`);
    const api = practice;
    const onRequest = (req: { method: string; path: string }, summary: string) => {
      if (state.child === child) log(`  ⇄ practice API: ${req.method} ${req.path} → ${summary}`);
    };
    api.onRequest.add(onRequest);
    child.once("exit", () => api.onRequest.delete(onRequest));
  }
  child.stdout?.on("data", (d: Buffer) => log(d.toString()));
  child.stderr?.on("data", (d: Buffer) => log(d.toString()));
  child.on("error", (err) => log(`Couldn't start: ${err.message}`));
  child.on("exit", (code, signal) => {
    if (state.child !== child) return;
    state.status.running = false;
    state.status.exitCode = code;
    log(signal ? `(stopped)` : `(exited with code ${code})`);
  });
  return getProcessStatus();
}

/** Send one HTTP request to the workspace's API server (only ever localhost:API_PORT). */
export async function sendToApi(method: string, path: string, body: string) {
  const started = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    const text = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") ?? "",
      body: text.length > 20_000 ? text.slice(0, 20_000) + "\n… (truncated)" : text,
      ms: Date.now() - started,
    };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    return {
      error:
        cause === "ECONNREFUSED"
          ? `Nothing is listening on port ${API_PORT}. Click "Start server" first.`
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}
