# Corpus path-portability: `<PROJECT_ROOT>` token + browsable `.consort/` mirror + retroactive sweep

**Problem.** Recorded prompts/transcripts embed the LIVE, ephemeral project root
(`/Users/…/tdd-workflow-smoke/<project>/…`). That dir is deleted on reclaim, so every embedded path
DANGLES when the corpus is examined later. Verified: ~56 turn files per run carry the absolute path,
all under `.consort/…` (94 refs in one run's prompts).

**Goal (option C).** Two complementary properties for the finished corpus:
1. **Portable** — no recorded text points outside the corpus at an ephemeral/mutable source.
2. **Browsable/clickable** — a reader (or file browser) can open the referenced file from the corpus.

A single blind prefix-swap CANNOT give (2): the same `.consort/` prefix maps to TWO different corpus
homes (seed vs produced), and there is NO `.consort/` dir at the record-dir root today. So the plan is:
build ONE browsable `.consort/` mirror at the record root, THEN rewrite embedded paths to `./.consort/…`
(clickable), keeping `<PROJECT_ROOT>` as the fallback token for any path with no durable file.

---

## Verified path → durable-home mapping (ground truth, run stockflow-instrumented-20260809-105157)

| Embedded reference (under project root) | Durable copy in corpus today |
|---|---|
| `.consort/product-overview.md`, `.consort/nfrs.md`, `.consort/design/design-brief.md`, `.consort/design/assets/warehouse.png` | `intake/…` (the seed) |
| `.consort/planning/…`, `features/…`, `cycles/…`, `design/{design-guide.json,ia.md,design-guide.md}`, `architecture/…`, `sprints/…`, `smells.json`, `run-config.json` | `recorded-artifacts/…` (cumulative produced) |
| `app/…`, `tests/…`, `client/…`, `alembic/…` (code; not seen in DESIGN prompts, appears in build) | per-turn `turns/<n>/replay-set/pre-project/…` (pre-state) + `turns/<n>/files/…` (delta) |

`intake/` and `recorded-artifacts/` union **without file-level collision** (both have `design/`, but
disjoint files), so a merged `.consort/` mirror is unambiguous. Precedence rule if they ever overlap:
**recorded-artifacts wins** (the produced final state supersedes the seed) — but assert no-collision and
fail loud if that assumption breaks.

---

## Stage 1 — Recorder already relativizes to `<PROJECT_ROOT>` (DONE, committed)

`consort/logging/turn-recorder.ts`: `relativizeProjectPaths(text, projectDir)` + `PROJECT_ROOT_TOKEN`
applied to `prompt.txt` (recordReplaySet) and the transcript (recordTurn renders a relativized copy).
This makes FUTURE runs portable at record time. It is the fallback layer: any path that has no durable
corpus file stays as `<PROJECT_ROOT>/…` rather than a dead absolute path.

## Stage 2 — Build the browsable `.consort/` mirror at the record root (POST-RUN, once final state exists)

New finalizer `consort/logging/finalize-corpus.ts` → `buildConsortMirror(recordDir)`:
- Precondition: run COMPLETE (`✓ BOTH sprints` or terminal). The mirror is the FINAL `.consort` state,
  so it must run after the last turn (the live `.consort` is gone by reclaim — build the mirror BEFORE
  reclaim, from `intake/` + `recorded-artifacts/`, which are durable).
- Create `<recordDir>/.consort/` and populate by copying:
  1. `recorded-artifacts/**` → `.consort/**` (the produced final state), then
  2. `intake/**` → `.consort/**` for any path NOT already present (seed fills the gaps: product-overview,
     nfrs, design-brief, assets/). Copy in this order so produced wins on any overlap.
- Assert no lossy overwrite: if an `intake/` file would overwrite a DIFFERENT-content produced file, fail
  loud (don't silently clobber) — record a `mirror-report.json` (files copied, source, any skips).
- `.consort/` is a COPY, not a symlink (portable across move/zip of the corpus).

## Stage 3 — Retroactive path sweep over recorded text (POST-RUN, after Stage 2)

New `consort/logging/finalize-corpus.ts` → `sweepRecordedPaths(recordDir)`:
- Inputs to rewrite: every `turns/**/replay-set/prompt.txt`, every `turns/**/transcript.md`, and
  `correspondence.jsonl` (its `contentRef`s already record-relative from the intake-owns-bytes fix, but
  sweep for any remaining absolute path).
- For each embedded `<PROJECT_ROOT>/…` OR raw absolute-project-root reference:
  - If the tail resolves to a real file under the new `.consort/` mirror → rewrite to `./.consort/<tail>`
    (browser-openable, relative to the record dir).
  - Else if it's a code path (`app/`, `tests/`, `client/`, `alembic/`) → rewrite to the LATEST
    `turns/<n>/replay-set/pre-project/<path>` that contains it (or leave `<PROJECT_ROOT>` if none) — code
    has no single mirror; document this as a known limitation (per-turn pre-project is the home).
  - Else → leave `<PROJECT_ROOT>/…` (honest fallback; no dangling absolute path remains).
- The sweep is idempotent (re-running yields no further change) and operates ONLY on recorded text, never
  on live artifacts.
- Emit `path-sweep-report.json`: counts of {rewritten-to-.consort, rewritten-to-pre-project,
  left-as-token, already-relative}, so a reader can audit coverage.

## Stage 4 — Wire the finalizer into the launcher (POST-RUN hook)

`examples/replay/launch-stockflow-instrumented.sh` (and the generic launcher): after a
successful/terminal run, BEFORE reclaim, call `node dist/.../finalize-corpus.js <recordDir>` →
`buildConsortMirror` then `sweepRecordedPaths`. Gate on run completion; skip on a mid-run abort (a
partial `.consort` mirror would be misleading — only mirror a finished corpus). Must run before
`rm -rf <project>` so intake/recorded-artifacts are intact (they are, they're in the record dir, not the
project — so ordering is actually safe either way, but keep it pre-reclaim for clarity).

## Stage 5 — Retroactive one-shot for EXISTING corpora

A standalone bin `bin/consort/finalize-corpus.cli.ts <recordDir>` that runs Stages 2+3 on an already-
recorded corpus (for run 17's own output + any prior kept corpus). Idempotent, so safe to re-run. This
is the "sweep every transcript retroactively" the user asked for — it works because Stage 2 first creates
the durable `.consort/` file the relative path points at.

## Verification (definitive browser-openable proof)

Hermetic test `tests/bdd/consort-finalize-corpus.test.ts`:
1. Build a fake record dir with `intake/` + `recorded-artifacts/` + a `turns/0000/replay-set/prompt.txt`
   embedding `<PROJECT_ROOT>/.consort/product-overview.md` and `<PROJECT_ROOT>/.consort/planning/x.md`.
2. Run buildConsortMirror → assert `<rec>/.consort/product-overview.md` (from intake) AND
   `<rec>/.consort/planning/x.md` (from recorded-artifacts) both EXIST with correct bytes.
3. Run sweepRecordedPaths → assert prompt.txt now says `./.consort/product-overview.md` +
   `./.consort/planning/x.md`, and that **`join(recordDir, thatRelativePath)` is a real file**
   (`existsSync` true) — THIS is the definitive "opens in a file browser" assertion.
4. Idempotence: run sweep twice → second run is a no-op (byte-identical).
5. Collision guard: an intake file whose path collides with a different-content produced file → fail loud.

Manual proof on run 17's real corpus (Stage 5 one-shot): after finalize, pick a rewritten path from a
transcript, resolve it against the record dir, and `open` it (or `ls -l`) to confirm it's a real file.

---

## Order of operations for run 17 specifically
1. Let run 17 reach `✓ BOTH sprints` (do NOT reclaim its project until the corpus is finalized — though
   intake/recorded-artifacts live in the record dir, so they survive reclaim regardless).
2. Implement Stages 2+3+5 on branch fix/review-refactor-code-input; hermetic test green; build dist.
3. Run the Stage-5 one-shot on run 17's record dir; verify a rewritten path opens.
4. Wire Stage 4 so the NEXT capture finalizes automatically.

Critical files: `consort/logging/turn-recorder.ts` (Stage 1, done), new
`consort/logging/finalize-corpus.ts` (Stages 2-3), new `bin/consort/finalize-corpus.cli.ts` (Stage 5),
`examples/replay/launch-stockflow-instrumented.sh` (Stage 4), new
`tests/bdd/consort-finalize-corpus.test.ts`.
