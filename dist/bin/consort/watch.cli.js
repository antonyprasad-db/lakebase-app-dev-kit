#!/usr/bin/env node

// bin/consort/watch.cli.ts
import * as fs4 from "fs";
import * as path2 from "path";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var planningDir = (tdd) => join(tdd, "planning");
var productOverviewMd = (tdd) => join(tdd, "product-overview.md");
var nfrsMd = (tdd) => join(tdd, "nfrs.md");
var designBriefMd = (tdd) => join(tdd, "design", "design-brief.md");
var designGuideJson = (tdd) => join(tdd, "design", "design-guide.json");
var featureProposalsMd = (tdd) => join(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.json");
var featureSpecMd = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.md");
var featureRequestMd = (tdd, f) => join(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => join(featureResolved(tdd, f), "architecture.json");
var architectureMd = (tdd, f) => join(featureResolved(tdd, f), "architecture.md");
var dbDesignJson = (tdd, f) => join(featureResolved(tdd, f), "db-design.json");
var dbDesignMd = (tdd, f) => join(featureResolved(tdd, f), "db-design.md");
var featureTestListJson = (tdd, f) => join(featureResolved(tdd, f), "test-list.json");
var featureTestListMd = (tdd, f) => join(featureResolved(tdd, f), "test-list.md");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// consort/orchestrator/drive/watch-classify.ts
function classifyDriveLine(raw) {
  const line = raw.replace(/\s+$/, "");
  if (/recorded under .*escalations\//.test(line)) {
    return { kind: "escalation", text: line.trim(), stop: true, outcome: "escalation" };
  }
  if (line.startsWith("[consort]")) {
    return { kind: "notice", text: line.replace(/^\[consort\] /, ""), stop: false };
  }
  if (/^lk: /.test(line)) {
    return { kind: "info", text: line.replace(/^lk: /, ""), stop: false };
  }
  const isDrive = line.startsWith("[drive]");
  const isSprint = line.startsWith("[sprint]");
  const isBracketed = /^\[[^\]]+\]/.test(line);
  if (!isDrive && !isSprint && !isBracketed) return null;
  if (/\bRAISED TO HIL\b/.test(line)) {
    return { kind: "escalation", text: line.replace(/^\[(drive|sprint)\] /, ""), stop: true, outcome: "escalation" };
  }
  if (/^\[drive\] GATE awaiting human approval:/.test(line)) {
    return { kind: "gate", text: line, stop: true, outcome: "gate" };
  }
  if (/^\[drive\] PAUSED\b/.test(line) || /^\[sprint\] paused on\b/.test(line)) {
    return { kind: "pause", text: line, stop: true, outcome: "pause" };
  }
  if (/^\[drive\] holding\b/.test(line)) {
    return { kind: "pause", text: line, stop: true, outcome: "pause" };
  }
  if (/^\[sprint\] .*\bcomplete:/.test(line) || /^\[drive\] done in \d+ actions\b/.test(line)) {
    return { kind: "done", text: line, stop: true, outcome: "done" };
  }
  if (/^\[drive\] stopped at --max-steps\b/.test(line)) {
    return { kind: "done", text: line, stop: true, outcome: "done" };
  }
  const perAction = line.match(/^\[drive\] \d{3} (.*)$/);
  if (perAction) return { kind: "dispatch", text: perAction[1], stop: false };
  if (/^\[drive\] \S+ turn [\d.]+s\b/.test(line)) {
    return { kind: "turn-done", text: line.replace(/^\[drive\] /, ""), stop: false };
  }
  if (/^\[sprint\] feature \d+:.*already shipped, skipping/.test(line)) {
    return { kind: "skip", text: line.replace(/^\[sprint\] /, ""), stop: false };
  }
  if (/^\[sprint\] feature \d+:/.test(line)) {
    return { kind: "feature", text: line.replace(/^\[sprint\] /, ""), stop: false };
  }
  if (/^\[drive\] turn stalled:/.test(line)) {
    return { kind: "stalled", text: line.replace(/^\[drive\] /, ""), stop: false };
  }
  return { kind: "info", text: line.replace(/^\[(drive|sprint)\] /, ""), stop: false };
}

// consort/orchestrator/open/open-in-editor.ts
import * as fs3 from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

// consort/orchestrator/open/resolve-review-artifacts.ts
import * as fs2 from "fs";
import { join as join2 } from "path";
function reviewArtifacts(consortDir, opts = {}) {
  const out = [];
  const add = (p) => {
    if (fs2.existsSync(p) && !out.includes(p)) out.push(p);
  };
  add(productOverviewMd(consortDir));
  add(nfrsMd(consortDir));
  add(featureProposalsMd(consortDir));
  add(join2(consortDir, "planning", "estimates.json"));
  add(designBriefMd(consortDir));
  add(join2(consortDir, "design", "design-guide.md"));
  add(designGuideJson(consortDir));
  add(join2(consortDir, "design", "ia.md"));
  const { feature: f, story: s } = opts;
  if (f) {
    add(featureRequestMd(consortDir, f));
    add(featureSpecMd(consortDir, f));
    add(featureSpecJson(consortDir, f));
    add(architectureMd(consortDir, f));
    add(architectureJson(consortDir, f));
    add(dbDesignMd(consortDir, f));
    add(dbDesignJson(consortDir, f));
    add(featureTestListMd(consortDir, f));
    add(featureTestListJson(consortDir, f));
    if (s) {
      add(join2(storyDir(consortDir, f, s), "story.md"));
      add(storyJson(consortDir, f, s));
      add(storyTestListJson(consortDir, f, s));
      try {
        for (const a of fs2.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
          add(join2(acsDir(consortDir, f, s), a));
        }
      } catch {
      }
    }
  }
  return out;
}

// consort/orchestrator/open/open-in-editor.ts
var APP_BUNDLE_CLIS = [
  "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
];
function findEditorCmd(env = process.env) {
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const name of ["cursor", "code"]) {
    for (const dir of pathDirs) {
      const p = path.join(dir, name);
      try {
        if (fs3.existsSync(p) && fs3.statSync(p).isFile()) return name;
      } catch {
      }
    }
  }
  for (const p of APP_BUNDLE_CLIS) {
    try {
      if (fs3.existsSync(p)) return p;
    } catch {
    }
  }
  return null;
}
function isInsideEditor(env = process.env) {
  return /vscode|cursor/i.test(env.TERM_PROGRAM ?? "") || Boolean(env.CURSOR_TRACE_ID) || Boolean(env.VSCODE_PID);
}
function openArtifactsInEditor(consortDir, opts = {}) {
  const env = opts.env ?? process.env;
  const files = reviewArtifacts(consortDir, { feature: opts.feature, story: opts.story });
  if (!files.length) return { files, opened: false, reason: "no-artifacts" };
  const cmd = findEditorCmd(env);
  if (!cmd) return { files, opened: false, reason: "no-editor" };
  if (!isInsideEditor(env) && !opts.force) return { files, opened: false, editor: cmd, reason: "not-in-editor" };
  const spawn = opts.spawn ?? ((c, fs22) => {
    spawnSync(c, fs22, { stdio: "ignore" });
  });
  try {
    spawn(cmd, files);
  } catch {
    return { files, opened: false, editor: cmd, reason: "no-editor" };
  }
  return { files, opened: true, editor: cmd };
}

// bin/consort/watch.cli.ts
function currentScope(consortDir) {
  try {
    const ws = JSON.parse(fs4.readFileSync(path2.join(consortDir, "workflow-state.json"), "utf8"));
    return { ...ws.feature_id ? { feature: ws.feature_id } : {}, ...ws.story_id ? { story: ws.story_id } : {} };
  } catch {
    return {};
  }
}
function parseArgs(argv) {
  const out = { fromStart: false, projectDir: process.cwd(), open: true, timeout: 90 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--log":
        out.log = argv[++i];
        break;
      case "--pid":
        out.pid = Number(argv[++i]);
        break;
      case "--timeout":
        out.timeout = Number(argv[++i]);
        break;
      case "--since":
        out.since = Number(argv[++i]);
        break;
      case "--from-start":
        out.fromStart = true;
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "--no-open":
        out.open = false;
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          "consort-watch , follow a backgrounded drive's live log and relay transitions.\n\n  consort-watch [--log <path>] [--pid <n>] [--from-start] [--project-dir <p>]\n\nDefaults --log to <consort>/drive-live.log (the scaffolded `> \u2026 2>&1 &` sink).\nStops at a gate / pause / escalation / run-end. Exit 0 clean, 3 escalation, 2 no log.\n"
        );
        process.exit(0);
    }
  }
  return out;
}
var PREFIX = {
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
  info: "   ."
};
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const logPath = args.log ?? path2.join(consortDir, "drive-live.log");
  if (args.since !== void 0) {
    if (!fs4.existsSync(logPath)) {
      process.stdout.write(`[consort-watch] cursor=0 status=waiting
`);
      return 0;
    }
    const size = fs4.statSync(logPath).size;
    const from = args.since < 0 || args.since > size ? 0 : args.since;
    let status = "running";
    if (size > from) {
      const fd = fs4.openSync(logPath, "r");
      const buf = Buffer.alloc(size - from);
      fs4.readSync(fd, buf, 0, buf.length, from);
      fs4.closeSync(fd);
      let inNotice2 = false;
      for (const line of buf.toString("utf8").split("\n")) {
        if (inNotice2) {
          if (/^\s+\S/.test(line)) {
            process.stdout.write(`${line.replace(/\s+$/, "")}
`);
            continue;
          }
          inNotice2 = false;
        }
        const c = classifyDriveLine(line);
        if (!c) continue;
        process.stdout.write(`${PREFIX[c.kind]} ${c.text}
`);
        if (c.kind === "notice") {
          inNotice2 = true;
          continue;
        }
        if (c.stop && c.outcome) status = c.outcome;
      }
    }
    if (status === "running" && args.pid !== void 0 && !alive(args.pid) && size <= from) status = "done";
    process.stdout.write(`[consort-watch] cursor=${size} status=${status}
`);
    return 0;
  }
  const APPEAR_MS = 3e4;
  const t0 = Date.now();
  while (!fs4.existsSync(logPath)) {
    if (args.pid && !alive(args.pid)) {
      process.stderr.write(`consort-watch: drive pid ${args.pid} exited before ${logPath} appeared.
`);
      return 2;
    }
    if (Date.now() - t0 > APPEAR_MS) {
      process.stderr.write(`consort-watch: no ${logPath} after ${APPEAR_MS / 1e3}s.
`);
      return 2;
    }
    await sleep(300);
  }
  let offset = args.fromStart ? 0 : fs4.statSync(logPath).size;
  let carry = "";
  let inNotice = false;
  const watchStart = Date.now();
  process.stderr.write(`consort-watch: following ${logPath}${args.pid ? ` (pid ${args.pid})` : ""}
`);
  for (; ; ) {
    const size = fs4.statSync(logPath).size;
    if (size < offset) offset = 0;
    if (size > offset) {
      const fd = fs4.openSync(logPath, "r");
      const buf = Buffer.alloc(size - offset);
      fs4.readSync(fd, buf, 0, buf.length, offset);
      fs4.closeSync(fd);
      offset = size;
      carry += buf.toString("utf8");
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        if (inNotice) {
          if (/^\s+\S/.test(line)) {
            process.stdout.write(`${line.replace(/\s+$/, "")}
`);
            continue;
          }
          inNotice = false;
        }
        const c = classifyDriveLine(line);
        if (!c) continue;
        process.stdout.write(`${PREFIX[c.kind]} ${c.text}
`);
        if (c.kind === "notice") {
          inNotice = true;
          continue;
        }
        if (c.stop) {
          if (c.outcome === "gate" || c.outcome === "pause") {
            if (args.open) {
              const res = openArtifactsInEditor(consortDir, currentScope(consortDir));
              if (res.opened) process.stderr.write(`consort-watch: opened ${res.files.length} artifact(s) for review in ${res.editor}.
`);
              else if (res.reason === "not-in-editor" && res.files.length) process.stderr.write(`consort-watch: review artifacts (not in an editor): ${res.files.map((f) => path2.basename(f)).join(", ")}
`);
            }
            process.stderr.write("consort-watch: control is back with you , run `consort-next` for the exact command, then re-run the drive.\n");
          } else if (c.outcome === "escalation") {
            process.stderr.write(`consort-watch: the run escalated , \`consort-diagnose\` bundles the forensics; after fixing the cause, \`consort-resolve-escalation\` clears it (do NOT rm the record), then re-run.
`);
          } else {
            process.stderr.write("consort-watch: run complete.\n");
          }
          return c.outcome === "escalation" ? 3 : 0;
        }
      }
    }
    if (args.pid && !alive(args.pid) && fs4.statSync(logPath).size <= offset) {
      process.stderr.write(`consort-watch: drive pid ${args.pid} is no longer running (no terminal line seen).
`);
      return 3;
    }
    if (args.timeout > 0 && (Date.now() - watchStart) / 1e3 >= args.timeout) {
      process.stderr.write(
        `consort-watch: still running after ${args.timeout}s and no gate yet , the drive continues in the background. Re-run \`consort-watch\` to keep relaying (or pass --timeout 0 when running consort-watch itself detached).
`
      );
      return 0;
    }
    await sleep(400);
  }
}
main().then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(`consort-watch: ${e instanceof Error ? e.message : String(e)}
`);
  process.exit(1);
});
//# sourceMappingURL=watch.cli.js.map