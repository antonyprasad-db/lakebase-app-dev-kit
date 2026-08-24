#!/usr/bin/env node
// consort-watch: follow a backgrounded drive's live log and relay each phase/role/
// gate transition in plain language, STOPPING when control returns to the human (a
// gate, a pause, an escalation) or the run ends. This is the kit-owned replacement
// for a session hand-rolling `tail -f .consort/drive-live.log | while read; case …`
// (brittle: it re-guesses the drive's line formats). The scaffolded slash commands
// background the drive to `.consort/drive-live.log`; run this to watch it.
//
//   consort-watch [--log <path>] [--pid <n>] [--from-start] [--project-dir <p>] [--tdd-dir <p>]
//
// Exit: 0 = clean stop (gate / pause / done); 3 = escalation; 2 = log never appeared.

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { classifyDriveLine, type WatchLineKind, type WatchClass } from "../../consort/orchestrator/drive/watch-classify.js";
import { openArtifactsInEditor } from "../../consort/orchestrator/open/open-in-editor.js";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

interface Args {
  log?: string;
  pid?: number;
  fromStart: boolean;
  projectDir: string;
  consortDir?: string;
  /** Open the reviewable artifacts in the editor when stopping at a gate/pause. */
  open: boolean;
  /** Bounded foreground wait (seconds): exit 0 ("still running") after this long
   *  WITHOUT a stop, so a foreground invocation stays under the harness's ~2min
   *  bash timeout (whose SIGTERM can otherwise kill a same-group drive). 0 = no
   *  bound (use when running consort-watch itself as a detached/background task). */
  timeout: number;
  /** POLL-ONCE mode: read new lines from this byte offset, relay them, print
   *  `[consort-watch] cursor=<N> status=<running|gate|pause|escalation|done|waiting>`,
   *  and EXIT immediately (no blocking). This is the harness-friendly relay: a
   *  long-blocking follow is NOT streamed to the human (they see only a spinner
   *  until it returns), so the caller LOOPS short `--since <cursor>` calls and
   *  narrates each batch. undefined = the (legacy) blocking follow mode. */
  since?: number;
}

/** The current feature/story from workflow-state, to scope the review-artifact open. */
function currentScope(consortDir: string): { feature?: string; story?: string } {
  try {
    const ws = JSON.parse(fs.readFileSync(path.join(consortDir, "workflow-state.json"), "utf8")) as {
      feature_id?: string | null;
      story_id?: string | null;
    };
    return { ...(ws.feature_id ? { feature: ws.feature_id } : {}), ...(ws.story_id ? { story: ws.story_id } : {}) };
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): Args {
  const out: Args = { fromStart: false, projectDir: process.cwd(), open: true, timeout: 90 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--log": out.log = argv[++i]; break;
      case "--pid": out.pid = Number(argv[++i]); break;
      case "--timeout": out.timeout = Number(argv[++i]); break;
      case "--since": out.since = Number(argv[++i]); break;
      case "--from-start": out.fromStart = true; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": case "--consort-dir": out.consortDir = argv[++i]; break;
      case "--no-open": out.open = false; break;
      case "-h": case "--help":
        process.stdout.write(
          "consort-watch , follow a backgrounded drive's live log and relay transitions.\n\n" +
            "  consort-watch [--log <path>] [--pid <n>] [--from-start] [--project-dir <p>]\n\n" +
            "Defaults --log to <consort>/drive-live.log (the scaffolded `> … 2>&1 &` sink).\n" +
            "Stops at a gate / pause / escalation / run-end. Exit 0 clean, 3 escalation, 2 no log.\n",
        );
        process.exit(0);
    }
  }
  return out;
}

const PREFIX: Record<WatchLineKind, string> = {
  dispatch: "  ->",
  "turn-done": "   ok",
  feature: " >>",
  skip: "  ~",
  gate: "GATE:",
  pause: "PAUSE:",
  escalation: "FAIL:",
  done: "DONE:",
  stalled: " !!",
  notice: "[consort]",
  info: "   .",
};

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Read the WHOLE log and return the LAST classified STOP line (gate/pause/escalation/
 *  done), or null if none. Used when the drive already reached a terminal marker before
 *  (or just as) we attached , a fast detached run that stopped before this follow
 *  started from EOF. Without it we'd miss the marker and falsely report an unclean exit.
 *  Works for ANY step (it matches whatever the classifier flags as a stop). */
export function scanLastStop(logPath: string): WatchClass | null {
  let last: WatchClass | null = null;
  try {
    for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
      const c = classifyDriveLine(line);
      if (c?.stop) last = c;
    }
  } catch {
    /* unreadable , treat as no stop found */
  }
  return last;
}

/** Emit the stop GUIDANCE for a terminal transition (open the review artifacts at a
 *  gate/pause; point at consort-diagnose on escalation; else "run complete") and return
 *  the process exit code (3 for escalation, else 0). The stop LINE itself is printed by
 *  the caller. Shared by the live follow AND the late-attach scan so both behave alike. */
function emitStop(c: WatchClass, consortDir: string, open: boolean): number {
  if (c.outcome === "gate" || c.outcome === "pause") {
    if (open) {
      const res = openArtifactsInEditor(consortDir, currentScope(consortDir));
      if (res.opened) process.stderr.write(`consort-watch: opened ${res.files.length} artifact(s) for review in ${res.editor}.\n`);
      else if (res.reason === "not-in-editor" && res.files.length) process.stderr.write(`consort-watch: review artifacts (not in an editor): ${res.files.map((f) => path.basename(f)).join(", ")}\n`);
    }
    process.stderr.write("consort-watch: control is back with you , run `consort-next` for the exact command, then re-run the drive.\n");
  } else if (c.outcome === "escalation") {
    process.stderr.write(`consort-watch: the run escalated , \`consort-diagnose\` bundles the forensics; after fixing the cause, \`consort-resolve-escalation\` clears it (do NOT rm the record), then re-run.\n`);
  } else {
    process.stderr.write("consort-watch: run complete.\n");
  }
  return c.outcome === "escalation" ? 3 : 0;
}

export type PollStatus = "running" | "gate" | "pause" | "escalation" | "done" | "waiting";
export interface PollResult {
  /** The lines a human sees this poll, already PREFIX-formatted (role/gate/etc.). */
  relayed: string[];
  /** New byte offset , pass as the next `--since`. */
  cursor: number;
  /** running until a stop is seen (this batch OR, when the pid is gone, anywhere in the log). */
  status: PollStatus;
}

/** POLL-ONCE, pure + testable (no stdout): read new lines from `since` to EOF, format
 *  each meaningful transition for relay, and resolve the status. This is the ONE relay
 *  the guidance mandates , the caller loops it (narrating `relayed` each time) until
 *  `status` is a stop. `isAlive` is injectable so a test can drive the pid-gone path. */
export function pollOnce(
  logPath: string,
  since: number,
  pid?: number,
  isAlive: (p: number) => boolean = alive,
): PollResult {
  if (!fs.existsSync(logPath)) return { relayed: [], cursor: 0, status: "waiting" };
  const size = fs.statSync(logPath).size;
  const from = since < 0 || since > size ? 0 : since; // clamp; truncation => re-read
  const relayed: string[] = [];
  let status: PollStatus = "running";
  if (size > from) {
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(size - from);
    fs.readSync(fd, buf, 0, buf.length, from);
    fs.closeSync(fd);
    let inNotice = false;
    for (const line of buf.toString("utf8").split("\n")) {
      if (inNotice) {
        if (/^\s+\S/.test(line)) { relayed.push(line.replace(/\s+$/, "")); continue; }
        inNotice = false;
      }
      const c = classifyDriveLine(line);
      if (!c) continue;
      relayed.push(`${PREFIX[c.kind]} ${c.text}`);
      if (c.kind === "notice") { inNotice = true; continue; }
      if (c.stop && c.outcome) status = c.outcome; // last stop in this batch wins
    }
  }
  // Process gone + nothing new PAST our cursor => scan the whole log for the real
  // terminal marker (a stop at any step the caller's cursor started after).
  if (status === "running" && pid !== undefined && !isAlive(pid) && size <= from) {
    status = scanLastStop(logPath)?.outcome ?? "done";
  }
  return { relayed, cursor: size, status };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const logPath = args.log ?? path.join(consortDir, "drive-live.log");

  // POLL-ONCE (--since <offset>): read new lines from the offset, relay them, print a
  // machine-readable `[consort-watch] cursor=<N> status=<…>` trailer, and EXIT at once.
  // This is the harness-friendly relay , a blocking follow is not streamed to the human
  // (they see only a spinner until it returns), so the caller LOOPS short --since calls
  // and narrates each batch. Returns fast whether or not there is new content.
  if (args.since !== undefined) {
    const r = pollOnce(logPath, args.since, args.pid);
    for (const line of r.relayed) process.stdout.write(`${line}\n`);
    process.stdout.write(`[consort-watch] cursor=${r.cursor} status=${r.status}\n`);
    return 0;
  }

  // Wait (bounded) for the log to appear , the drive may be backgrounding just now.
  const APPEAR_MS = 30_000;
  const t0 = Date.now();
  while (!fs.existsSync(logPath)) {
    if (args.pid && !alive(args.pid)) {
      process.stderr.write(`consort-watch: drive pid ${args.pid} exited before ${logPath} appeared.\n`);
      return 2;
    }
    if (Date.now() - t0 > APPEAR_MS) {
      process.stderr.write(`consort-watch: no ${logPath} after ${APPEAR_MS / 1000}s.\n`);
      return 2;
    }
    await sleep(300);
  }

  // Follow from the current end (like `tail -n 0 -f`) unless --from-start.
  let offset = args.fromStart ? 0 : fs.statSync(logPath).size;
  let carry = "";
  // A `[consort]` disclosure is multi-line: the first line classifies as `notice`;
  // the following indented lines (the opt-out + Level-2 offer) carry no prefix, so we
  // surface them verbatim while inside the block. Persists across chunk reads.
  let inNotice = false;
  const watchStart = Date.now();
  process.stderr.write(`consort-watch: following ${logPath}${args.pid ? ` (pid ${args.pid})` : ""}\n`);

  for (;;) {
    const size = fs.statSync(logPath).size;
    if (size < offset) offset = 0; // truncated / rotated , restart
    if (size > offset) {
      const fd = fs.openSync(logPath, "r");
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = size;
      carry += buf.toString("utf8");
      const lines = carry.split("\n");
      carry = lines.pop() ?? ""; // keep the partial last line for next read
      for (const line of lines) {
        // Inside a `[consort]` disclosure block, surface the indented continuation
        // lines (opt-out + Level-2 offer) verbatim; a blank / non-indented line ends it.
        if (inNotice) {
          if (/^\s+\S/.test(line)) { process.stdout.write(`${line.replace(/\s+$/, "")}\n`); continue; }
          inNotice = false;
        }
        const c = classifyDriveLine(line);
        if (!c) continue;
        process.stdout.write(`${PREFIX[c.kind]} ${c.text}\n`);
        if (c.kind === "notice") { inNotice = true; continue; }
        // The exact next command lives in the authoritative read-only surface, not in
        // this line's indented follow-up (which the classifier skips) , emitStop points there.
        if (c.stop) return emitStop(c, consortDir, args.open);
      }
    }
    // Drive process gone + nothing more to read PAST our offset. This is the common
    // late-attach case: a fast detached drive wrote its terminal marker (a PAUSE at any
    // step, a gate, done) and exited BEFORE we started following from EOF. Scan the whole
    // log for the last stop and report the REAL outcome , NOT a false "unclean exit".
    // Only when there is genuinely no stop marker anywhere is it a crash/kill.
    if (args.pid && !alive(args.pid) && fs.statSync(logPath).size <= offset) {
      const last = scanLastStop(logPath);
      if (last) {
        process.stdout.write(`${PREFIX[last.kind]} ${last.text}\n`);
        return emitStop(last, consortDir, args.open);
      }
      process.stderr.write(`consort-watch: drive pid ${args.pid} is no longer running (no terminal line seen).\n`);
      return 3;
    }
    // Bounded foreground wait: exit cleanly BEFORE the harness's ~2min bash timeout
    // fires a SIGTERM (which, if the drive shares this process group, would kill the
    // drive too). The drive keeps running detached; re-run consort-watch to resume.
    if (args.timeout > 0 && (Date.now() - watchStart) / 1000 >= args.timeout) {
      process.stderr.write(
        `consort-watch: still running after ${args.timeout}s and no gate yet , the drive continues in the background. ` +
          `Re-run \`consort-watch\` to keep relaying (or pass --timeout 0 when running consort-watch itself detached).\n`,
      );
      return 0;
    }
    await sleep(400);
  }
}

if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-watch: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
