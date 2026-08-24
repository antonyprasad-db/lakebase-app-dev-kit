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
import { classifyDriveLine, type WatchLineKind } from "../../consort/orchestrator/drive/watch-classify.js";
import { openArtifactsInEditor } from "../../consort/orchestrator/open/open-in-editor.js";

interface Args {
  log?: string;
  pid?: number;
  fromStart: boolean;
  projectDir: string;
  consortDir?: string;
  /** Open the reviewable artifacts in the editor when stopping at a gate/pause. */
  open: boolean;
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
  const out: Args = { fromStart: false, projectDir: process.cwd(), open: true };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--log": out.log = argv[++i]; break;
      case "--pid": out.pid = Number(argv[++i]); break;
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
  info: "   .",
};

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const logPath = args.log ?? path.join(consortDir, "drive-live.log");

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
        const c = classifyDriveLine(line);
        if (!c) continue;
        process.stdout.write(`${PREFIX[c.kind]} ${c.text}\n`);
        if (c.stop) {
          // The exact next command lives in the authoritative read-only surface, not
          // in this line's indented follow-up (which the classifier skips). Point there.
          if (c.outcome === "gate" || c.outcome === "pause") {
            // Surface the artifacts under review in the editor (when inside Cursor/Code),
            // so the human reviews the spec/architecture/test-list/ACs without hunting.
            if (args.open) {
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
      }
    }
    // Drive process gone + nothing more to read => it ended without a clean terminal
    // line (a crash / kill). Report and stop so the watcher never hangs forever.
    if (args.pid && !alive(args.pid) && fs.statSync(logPath).size <= offset) {
      process.stderr.write(`consort-watch: drive pid ${args.pid} is no longer running (no terminal line seen).\n`);
      return 3;
    }
    await sleep(400);
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`consort-watch: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
