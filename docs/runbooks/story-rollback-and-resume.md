# Runbook: roll back ONE story and resume a live capture in place

Undo a single story's design + build on an intact, halted live capture — footing
every surface back to the **prior story's acceptance** — then resume the same run so
the deterministic drive re-derives the rolled-back story as fresh (dispatches
`spec-author` for it). This avoids re-driving the earlier stories live.

Worked example throughout: run `stockflow-instrumented-20260809-105157`, rolling back
`S3-view-sku-detail` to the end of turn 041 (`S2` accepted), after fixing the
`ux-adherence` class-i bug. Substitute your own `<PROJECT_NAME>`, `<FEATURE>`, `<STORY>`.

---

## The one thing to understand first: the route is DERIVED from `pipeline.json`

`consort/orchestrator/state/orchestrator-derive.ts` builds each story's view from its
`pipeline.json` entry, **not** from what is on disk under `acs/`:

- `gateApproved = entry.gate?.status === "approved"` — a story whose `gate` is approved
  routes straight to **build**, even if you delete its `acs/`. (`orchestrator-drive.ts`
  `nextDesignAction` only returns `spec-author` when the story is NOT gate-approved and
  `!hasAcs`.)
- `buildActive = pipeline.build_active` (a **top-level** field). If it still names the
  story, the drive dispatches `navigator` for `red`; if you then removed the story's
  entry it crashes with `Cannot read properties of undefined (reading 'build')`.
- `storyOrder = Object.keys(pipeline.stories)`. **Removing** the story entry drops it
  from the feature → the drive returns `feature-complete`. Also wrong.

**Correct reset for "this story goes back to design":** keep the entry, set it to
exactly `{ "status": "designing" }` (no `gate`, no `experiment`, no `acceptance`), and
set the top-level `build_active` to `null`. Then `hasAcs=false` (acs deleted) and
`nextDesignAction` returns `{ invoke-role, spec-author, story }`.

---

## Procedure

### 0. Back up first (outside the repo)

`cp -R` both the project `.consort` and the recording (`REC`) to a `.pre-rollback`
sibling **outside** the project git repo (a `git checkout` in step 2 will not touch it,
and it won't be swept into a commit). Keep them until the resumed run is proven.

### 1. Find the boundary

The boundary is the last turn of the *prior* story (its `accept`). Enumerate
`REC/turns/` and each `turn.json`'s `story`/`role`/`mode` to find the first turn of the
story being rolled back; everything from there on is dropped. Note the boundary ordinal
(e.g. 41).

### 2. Delete the live git + Lakebase experiment branch

The story's paired experiment branch must go so a fresh one can fork from the feature
branch on resume.

```
git -C <PROJECT> checkout <FEATURE_BRANCH>          # off the exp branch first,
                                                    # else git-local delete is skipped
```
Then the kit's paired teardown (git local+remote + Lakebase in one), instance =
`LAKEBASE_PROJECT_ID` from the project `.env`:
```
node -e '(async()=>{const {deletePairedBranch}=require("<KIT>/dist/scripts/lakebase/index.cjs");
  console.log(await deletePairedBranch({instance:"<PROJECT_NAME>",
  branch:"experiment-<story-slug>-exp1", cwd:"<PROJECT>"}));})()'
```
Expect `{lakebaseDeleted:true, gitLocalDeleted:true, gitRemoteDeleted:true}`. staging +
feature branch are untouched.

### 3. Roll back the live `.consort`

- `rm -rf .consort/cycles/<FEATURE>/<STORY>` and `.consort/experiments/<FEATURE>/<STORY>`.
- Under `.consort/features/<FEATURE>/stories/<STORY>`, remove ONLY the spec-author-and-later
  outputs: `acs/`, `test-list-per-story.json`, `reflect-verdict.json`. **KEEP `story.json`
  and `story.md`** — those are BREAKDOWN outputs (a design-lane predecessor), and the
  `spec-author` step requires `story.json` as its `story-stub` input (`spec-author-story.json`
  manifest, `source: "story:story.json"`). Deleting them makes the resumed `spec-author`
  fail-loud with `missing input "story-stub"`. (Rule of thumb: keep everything produced at or
  before breakdown; remove everything produced by spec-author onward.)
- `smells.json`: remove the entry whose `story_id` is `<STORY>` (keep the others).
- **`features/<FEATURE>/pipeline.json`** (the one that actually gates the route): set the
  `<STORY>` entry to `{ "status": "designing" }` (drop its `gate`/`experiment`/`acceptance`)
  and set top-level `"build_active": null`. KEEP the entry in `stories` (storyOrder).
- KEEP `features/<FEATURE>/feature-spec.json` `stories[]` listing `<STORY>`.

### 4. Restore the untracked design-guide (checkout casualty)

The `git checkout` in step 2 **wipes untracked `.consort` working-tree files**. The
project style guide — `.consort/design/design-guide.json`, `design-guide.md`, `ia.md` —
is NOT git-tracked, so it disappears and `ux-designer` re-runs from ordinal 0 on resume.
Restore those three files from the step-0 backup. Diff the whole live `.consort` against
the backup (excluding the intentional `<STORY>` deletions) to catch any other casualty.

### 5. Prune the recorded corpus to the boundary

- `REC/turns/`: remove the story's turn dirs; rewrite `turns/index.json` to keep only
  ordinals ≤ boundary.
- `REC/recorded-artifacts/` (cumulative `.consort` mirror): the SAME subtree removals as
  step 3, the SAME `smells.json` edit, AND the SAME `pipeline.json` reset. It must match
  the live `.consort`, or the finalize-corpus mirror reintroduces the story.
- `REC/recorded-build/features/<FEATURE>/stories/<STORY>`: remove (story-keyed code trees).
- Append-only logs — truncate each at its own boundary line (find it, do not guess):
  - `.consort/agent-log.jsonl`: keep through the prior story's last event
    (`experiment.accepted`), drop the `handoff dispatch spec-author` for `<STORY>` onward.
  - `REC/agent-live.log`: keep through the last `TURN START` before `<STORY>` design.
  - `REC/correspondence.jsonl`: keep lines whose `ordinal` ≤ boundary.

### 6. VERIFY with a dry-run (before any live relaunch)

```
node <KIT>/dist/bin/consort/drive.cli.js --feature <FEATURE> --project-dir <PROJECT> --dry-run
```
- Expected: `{ "action": { "kind": "invoke-role", "role": "spec-author", "story": "<STORY>" } }`.
- `feature-complete` → you dropped the entry from `pipeline.stories` (storyOrder). Re-add it.
- `navigator … red` or a `Cannot read properties of undefined (reading 'build')` crash →
  the entry still has an approved `gate`, or `build_active` still names the story. Reset both.

### 7. Restart the runner, then relaunch

`pkill -f <PROJECT_NAME>` (used during any abort) also kills the self-hosted runner
listener, whose process command contains the project name. The launcher skips scaffold on
resume (`FRESH=0`) so it does NOT restart it. Restart it detached:
```
cd ~/.lakebase/runners/<PROJECT_NAME> && nohup ./run.sh > /tmp/runner-restart.log 2>&1 &
# confirm "√ Connected to GitHub … Listening for Jobs"
```
Then relaunch pinned to the same run (recorder resumes at `turns/index.json` length =
boundary ordinal, per `turn-recorder.ts`):
```
STAMP=<run-stamp> nohup bash examples/replay/captures/launch-stockflow-instrumented.sh > <resume-log> 2>&1 &
```

## CRITICAL: HEAD must be on the FEATURE branch before design + cut-experiment

The single most damaging failure mode when resuming from a pruned start. `cut-experiment`
creates the paired experiment branch by git-branching off **the currently-checked-out
branch** (`createPairedBranch` forks git from HEAD; the Lakebase side takes an explicit
`--parent`, so the two can DIVERGE). On a `FRESH=0` resume the claim/planning lane can
report `alreadyClaimed` and leave HEAD on the parent tier (`staging`) instead of the
feature branch — a fresh run gets the feature checkout for free, a resume does NOT.

If HEAD is on `staging` when the story's turns run:
- Lakebase forks the experiment correctly from `feature-f1` (explicit `--parent`), but
  git creates no experiment branch off the feature — HEAD stays on `staging`.
- driver-green then builds and (unless the tier is protected) **commits green onto
  `staging`**, irreversibly polluting the parent tier and breaking the promotion topology.
  `DEFAULT_PROTECTED_TIER_NAMES` is empty by default, so there is NO safety halt.

**Code fix (landed in `_replay-smoke.sh`):** right after the claim + `verify-workflow-state`,
the launcher now parses the claimed branch from the claim `--json`, `git checkout`s it,
runs `lk lakebase-branch checkout-paired` to sync `.env`/Lakebase, and asserts
`HEAD == <feature-branch>` before `consort-drive` (fails loud otherwise). This closes the
`alreadyClaimed` short-circuit: a fresh claim's `createPairedBranch` did the checkout, a
resume did not, so HEAD stayed on the staging tier. With the guard, both paths reach the
drive on the feature branch.

Guards, in order:
1. BEFORE relaunch, `git -C <PROJECT> checkout <FEATURE_BRANCH>` and confirm
   `git rev-parse --abbrev-ref HEAD` == the feature branch. (Now also enforced in-launcher.)
2. The tripwire during the run: `git rev-parse --abbrev-ref HEAD` should be the
   experiment branch once cut-experiment has run; if it is `staging`/a tier, STOP — the
   cut mis-forked. Check `git worktree list` and the `reflog` for a
   `feature-… -> staging` checkout with no following `-> experiment-…`.
3. Recovery when caught pre-commit (no green committed): stop the drive, delete the
   orphaned Lakebase experiment branch (`deleteBranch` — the git branch never existed),
   `git checkout -f <FEATURE_BRANCH>` discarding the mis-branched working tree, then roll
   the corpus back to the `dispatch` turn (see below) and un-cut the experiment in
   pipeline.json so next-action re-resolves to `cut-experiment`.

### Rolling back to a specific turn (e.g. end of `dispatch`, so next = cut-experiment)

Same surfaces as the story rollback, but to a mid-story turn boundary:
- `turns/`: remove the dirs after the target ordinal; rewrite `index.json` to ordinals ≤ target.
- 3 append-only logs at their target-turn boundary line: `agent-log.jsonl` (last event of
  the target turn — e.g. `orchestrator START build`, the dispatch effect, is kept; the next
  `experiment.cut` is dropped), `agent-live.log` (last `TURN START`/`TURN CLOSE` ≤ target),
  `correspondence.jsonl` (ordinal ≤ target).
- `.consort/cycles/F/<S>` and `.consort/experiments/F/<S>`: remove (written by the turns you dropped).
- `pipeline.json` (live + recorded-artifacts): to land on "dispatched, not yet cut" so the
  router returns `cut-experiment`, keep the story `status: "building"` + `gate: approved` +
  top-level `build_active: <S>`, and DELETE the story's `experiment` block. The router
  (`nextBuildAction`) returns `{cut-experiment}` iff `!experimentCut`, and
  `experimentCut = entry.experiment != null`.
- Verify with `drive.cli --dry-run` → `{cut-experiment, story:<S>}`. (Dry-run still runs
  the Databricks auth preflight, so a stale token surfaces here as an auth failure, not a
  routing answer — `databricks auth login` first, then re-run the dry-run.)

## Mixed-dist corpus: relativize the OLD turns retroactively

If the pre-halt turns were recorded under a dist BEFORE the recorder relativized the
ephemeral project root (Stage 1), their `prompt.txt`/`transcript.md` embed the raw
absolute project path, while the resumed turns (recorded under the fixed dist) use the
`<PROJECT_ROOT>` token. Bring the old turns to the same format so the whole corpus is
uniform. Use the recorder's OWN `relativizeProjectPaths(text, projectRoot)` (from
`consort/logging/turn-recorder.ts`) — the exact transform the live recorder applies —
over `turns/<NNNN>/replay-set/prompt.txt` + `transcript.md` for the OLD ordinals only
(the resumed turns are already tokenized). Verify `grep -rl "<ABS>" turns/` returns 0.

Do NOT sweep `agent-live.log` / `correspondence.jsonl` mid-run: they are still being
appended (old-dist lines for ≤boundary + new lines after), so a live sweep races the
writer. The end-of-run `consort-finalize-corpus <REC> --live-root <ABS>` handles those
(raw-abs → `<PROJECT_ROOT>` → `./.consort/…` browsable) after the run completes.

## Watch on resume
- First recorded turn is the boundary ordinal, dispatching `spec-author` for `<STORY>`.
- If the rollback was to prove a build-lane fix, watch for the story's `REVIEWED …
  refactor` to be FOLLOWED by a `driver … refactor` dispatch (self-heal), not `RAISED TO HIL`.
