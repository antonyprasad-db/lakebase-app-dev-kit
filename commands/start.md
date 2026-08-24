---
description: Launch the Consort workflow (spec-first design, test-driven build on paired Lakebase branches). In a scaffolded project, takes stock and resumes the /plan -> /design -> /build -> /deploy loop; elsewhere, guides you through creating a project, then resumes.
---

# /consort:start : launch the Consort workflow

This command launches the Consort (spec-first, test-driven) loop. First detect where you are, then branch.

**Check the current project root for a `.consort/` directory.**
- If `.consort/` exists, go to **A. Resume**.
- If it does not, go to **B. Create**.

---

## A. Resume an existing Consort project

Drive the workflow through the **deterministic orchestrator** (`consort-drive`), invoked by the slash commands below. You coordinate only: run the right command for the project's state, and surface every gate to the human. The driver spawns the role agents (`product-owner`, `spec-author`, `ux-designer`, `architect-reviewer`, `test-strategist`, `navigator`, `driver`, or `release-engineer`), which are scaffolded into the project's `.claude/agents/` and invoked as `claude --agent <role>`, and obeys the state machine; the orchestrator is not an LLM agent. You write no spec, code, test, or deploy yourself.

1. **Take stock** (read, then summarize back): `.consort/product-overview.md` (what the product is), `.consort/nfrs.md`, `.consort/design/design-brief.md` (if UI), `.consort/workflow-state.json` (current `phase` + locus, your source of truth), `.consort/planning/feature-proposals.md`, and each `.consort/features/*/` (feature-request, feature-spec, architecture, test-list, gates.json). Confirm SCM state via `lakebase-scm-state`. Give the human a short situation report: what the project is about, the current phase, and each feature's status.
   - **This project pins its kit to a version.** A project created by a recent kit records the exact release it was scaffolded with in `.lakebase/kit-ref` (e.g. `v0.3.15`) , an IMMUTABLE tag , so `./scripts/lk` always resolves that same version from a version-keyed cache and never silently drifts onto a moving `main`. That determinism is deliberate: upgrading the runtime kit is an explicit step (below), not something a background tip-move does to you mid-work.
   - **Check for a newer Consort first.** Run `./scripts/lk consort-check-update` (throttled to once/day, silent when current, never blocks). If it prints that a newer version is available, relay it and offer to upgrade before continuing:
     1. Update the plugin (the slash commands): `claude plugin marketplace update databricks-solutions && claude plugin update consort@databricks-solutions`, then restart Claude Code.
     2. Move THIS project onto that version , the plugin update does NOT touch a project's runtime kit: write the new version tag into `.lakebase/kit-ref` (e.g. `printf 'vX.Y.Z\n' > .lakebase/kit-ref`) then `./scripts/lk --refresh` to install it. Because the ref is version-keyed, this is a one-time fresh install; future runs are instant.
   - **Older project pinned to `main` (or no `.lakebase/kit-ref`)?** That's the legacy, drift-prone case: `./scripts/lk --install` only reinstalls if `main`'s tip moved and the fast path otherwise serves whatever it first cached. Pin it to a real version once , `printf 'v<current>\n' > .lakebase/kit-ref && ./scripts/lk --refresh` , and it stops drifting. The drive auto-refreshes the project's `.claude/agents/` when it detects the kit changed; to refresh out of band run `./scripts/lk lakebase-update-agents`.
2. **Continue the loop.** Offer the human the autonomous path or a single step:
   - **Whole sprint (autonomous):** **`/sprint [name]`** flows plan -> per feature `design` -> `build` -> `deploy`, pausing only at gates. Resumable; re-invoke to continue past an approved gate.
   - Or one phase at a time (lowest-ready first):
     - No sprint backlog (or the last sprint shipped) -> **`/plan`** (Spec Author proposes; the PO authors the next sprint's requests, folding in what the last working software revealed).
     - A feature has a `feature-request.md` but no conformant `test-list.json` -> **`/design <feature-id>`**.
     - Designed but not built -> **`/build <feature-id>`**.
     - Built but not deployed/reviewed -> **`/deploy <feature-id> --target local`** (the working-software gate).
   - Need to explore an unknown first? **`/spike <slug> [--for <feature>]`** (throwaway, outside the loop).
   - Confirm the chosen step with the human, invoke that project-scaffolded command (it runs the deterministic driver, which spawns the role agents + pauses at gates), then loop.
   - **Run the driver in the BACKGROUND and relay each role AS IT STARTS , do NOT run it foreground and narrate from chunks.** The driver streams one `[drive] NNN dispatch <role> for <phase>` line to stderr the moment each role STARTS (e.g. `dispatch dba for design`, then `dispatch test-strategist for design`), and a `[drive] <role> turn Ns` line when it finishes. A blocking foreground run buffers these, so you only observe whatever state exists when the call returns , which is how a role ends up announced only at completion ("Test Strategist has produced …") while another was caught mid-flight ("the DBA is now turning …"). Instead background the command to `.consort/drive-live.log` (`... > .consort/drive-live.log 2>&1 &`) and **watch it with the kit's own `./scripts/lk consort-watch --pid <drive-pid>`** , do NOT hand-roll a `tail -f … | while read; case …` loop (it re-guesses the drive's line formats and is brittle). `consort-watch` relays each `dispatch <role>` at its START and each turn's completion in plain language, and STOPS at a gate / pause / escalation / run-end; when it stops, run `consort-next` for the exact command that clears it. This is the orchestrator-contract's rule 1 (`skills/consort/references/orchestrator-contract.md`); follow it for `/sprint`, `/plan`, `/design`, `/build`, and `/deploy` alike.

**Teardown / reclaim** (run from inside the project; both default the Lakebase instance + host from the project `.env`, so you need not re-specify them):
- **Done with a spike?** `./scripts/lk consort-spike delete --slug <slug>` tears down its paired Lakebase + git branch. Notes are KEPT by default (the learning survives); add `--purge-notes` to also remove `.consort/spikes/<slug>/`.
- **Reclaim a whole project's substrate?** `./scripts/lk lakebase-scm-cleanup list` (see what's there), then `... branches` (delete the ephemeral branches; tiers + trunk protected) or `... project --confirm <id>` (destroy the project). Dry-run unless `--yes`. This is the counterpart to `lakebase-create-project`.

The commands (`/sprint`, `/plan`, `/design`, `/build`, `/deploy`, `/spike`) are scaffolded into the project (version-pinned); you invoke them, you do not reimplement them. You write no spec, code, test, or deploy yourself.

---

## B. Create a new project, then resume

There is no `.consort/` here, so bootstrap one.

### First-project example (offer on the FIRST run only)

Before the create questions, on the user's **first** time only, offer the bundled **StockFlow** example so they can see the whole workflow on a real product instead of authoring their own intake:

- **Gate , first run only.** Compute `MARKER="${XDG_CONFIG_HOME:-$HOME/.config}/consort/first-project-offered"`. If it **already exists**, SKIP this offer entirely (they have used Consort before) and go straight to the create questions. Otherwise make the offer, then `mkdir -p "$(dirname "$MARKER")" && touch "$MARKER"` (either way) so it is never offered again. This marker is deliberately SEPARATE from `~/.config/consort/telemetry.json` so it never affects the one-time telemetry notice.
- **The offer.** Ask: create your **own** project, or **run the bundled StockFlow example** (a warehouse-inventory product you drive end to end)?
- **If they pick the example:** most create settings are FIXED for it (language `python`, **`--ui-track` on** , StockFlow is a UI product with a `design-brief.md`, so the create command MUST pass `--ui-track`; E2E is then forced on; model profile **Default**), so the ONLY things left to ask are:
  - **project name** (kebab-case), **parent directory** (default: the parent of cwd, else `~/code`), and **Databricks host** (offer `$DATABRICKS_HOST` / `~/.databrickscfg`). These are FREE TEXT: ask them in plain prose, and do NOT put them through a multiple-choice question (that is what triggers an "Invalid tool parameters" error: a text answer has no options).
  - **GitHub owner, or `--no-github`**: the one genuine either/or, and it sets the tier count. A GitHub owner ⇒ tiers `2` (prod + staging); `--no-github` ⇒ tiers `1` (prod only). This is the only decision worth a structured choice.

  Then create the project (below), `cd` in, **refresh the project's runtime kit to the current release**, and bring in the seed files with the kit bin:
  ```bash
  ./scripts/lk --refresh                        # re-download the Consort toolkit fresh (avoids a stale shared cache from an earlier project)
  ./scripts/lk lakebase-stage-first-project
  ```
  The `--refresh` matters: the Consort toolkit is cached per version in a shared location (`~/.cache/consort/<ref>`), so a project created after you last used an OLDER kit can otherwise run that stale cache and miss newly-added bins like `lakebase-stage-first-project`. `--refresh` reinstalls it unconditionally, so the project runs the kit you just installed. (If `--refresh` reports the bin still missing, your Consort plugin itself is behind , update it per "Check for a newer Consort" above , then re-run.)
  It copies the example's intake (`product-overview.md`, `nfrs.md`, `design-brief.md`, and the warehouse icon) and one `feature-request.md` per feature into the new project's `.consort/`. Then resume: **`/plan`** (the Spec Author proposes a sprint from the staged intake), or **`/design F1-stock-visibility`** to jump straight into the first feature. `examples/first-project/README.md` in the kit is the walkthrough.
- **If they pick their own project:** proceed with the questions below as normal.

Walk the user through the create questions (ask, do not assume; offer the noted defaults). Most of these are FREE TEXT (project name, parent directory, Databricks host, GitHub owner): ask them in plain prose. Reserve a structured multiple-choice prompt only for the genuine either/or decisions (tiers 1/2/3, language, UI track (UI SPA / backend-only), E2E on/off, model profile); never wrap a free-text answer in an options prompt (it errors with "Invalid tool parameters").

- **Project name** (kebab-case, the Lakebase id + dir name; on the `--no-github` path the creator makes the target directory, or reuses an existing EMPTY one, but refuses a non-empty directory); **parent directory** (default: parent of cwd or `~/code`); **Databricks host** (offer `DATABRICKS_HOST` / `~/.databrickscfg` if present); **GitHub owner** (or `--no-github`); **tiers** (`1` prod / `2` prod+staging / `3` prod+staging+dev, surface this, do not pick silently; **tiers `2`/`3` require a GitHub repo**, cutting a long-running tier pushes its git side to origin, so `--no-github` with `--tiers 2`/`3` is refused up front, pair `--no-github` with `--tiers 1`); **language** (`python`/`nodejs`/`java`/`kotlin`); **UI track** (see just below , you MUST set it explicitly); **E2E/Infra** (default on for nodejs; forced on when UI track is on); **model profile** (see "Per-role model profile" just below).

**UI track , ASK it, never leave it unset.** A structured either/or that is the SINGLE SOURCE for "this project has a UI": a **UI SPA** project ⇒ pass **`--ui-track`** (the creator scaffolds a React `client/`, sets `clientFramework=react`, and REQUIRES the e2e harness so E2E is forced on), a **backend-only** project ⇒ pass **`--no-ui-track`** (`clientFramework=none`, no client scaffold). It drives whether the design lane may author client/E2E ACs and whether the UX role runs. **`lakebase-create-project` defaults an UNSET flag to backend-only (`--no-ui-track`)**, so if you skip this question a UI product is silently scaffolded with NO client , its home-screen/E2E ACs then have nowhere to build and the run's honest-GREEN verify refuses to pass (the `run-tests.sh` client-scaffold guard). If the intake has a `design/design-brief.md` (a UI product), the answer is almost certainly `--ui-track`; confirm with the user rather than assuming. Pass exactly one of `--ui-track` / `--no-ui-track` on every create.

### Per-role model profile

Offer the user one of two paths (default to **Default**):

1. **Default (recommended).** Use the kit's tuned defaults: each role on its recommended model, with the per-step model + effort tuning that ships in the step-manifests (for example, a deeper model on the `assess` turn and a smaller model at low effort on the mechanical `red` turn). This is the highest-quality, validated configuration. Pick it unless you have a specific reason not to.
2. **Customize.** Cherry-pick the model AND the reasoning effort yourself, per role and (optionally) per manifest step. For a role you can set one model/effort for all its turns, or a per-step map that changes only the steps you name and leaves the rest on the tuned default.

**Default writes no overrides.** The resolver reads model + effort straight from the step-manifests (`agentOptions`) plus each role's recommended base, so the shipped tuning applies exactly as-is. Do NOT pass `--agent-model` on the Default path.

**Customize** is persisted to the project's `.lakebase/consort-config.json` (NOT `agent-config.json`); the resolver layers its `roles.<role>` entries ON TOP of the manifest tuning:
- `model`: a string (applies to all of that role's turns) or a map `{ "<step>": "<model>" }`.
- `effort`: a level (all turns) or a map `{ "<step>": "<level>" }`.

⚠️ A **scalar** `model`/`effort` on a role overrides the tuned per-step values for ALL that role's turns (it flattens the tiering). Use a **per-step map** to change only specific steps and keep the tuning everywhere else: the map is the scalpel, the scalar is the blunt instrument.

Step keys (`<step>`): build turns `red` / `green` / `review` / `refactor` / `assess` / `repair` / `reflect`; design steps `breakdown` / `propose` / `acs` / `estimate` / `architect` / `dba` / `test-list` / `ux`. Effort levels: `default` (omit) / `low` / `medium` / `high` / `xhigh` / `max`.

Realize it: on the **Default** path pass no model flags. On the **Customize** path, pass any simple per-role model picks to `lakebase-create-project` via `--agent-model <role>=<model>`, then write per-role effort and any per-step model/effort maps into `.lakebase/consort-config.json` under `roles.<role>` after creation (the file is editable and resolver-honored). The selection persists there.

Then run the kit's creator (surface the exact command first; report its output, which prints a `Next:` hint).

**BEFORE you run it, give the human the full timeline so they can step away and come back at the right time.** This is a one-time provision of a few minutes; it must not look hung, and they shouldn't have to babysit it. Present the itemized steps with their usual durations and a total ETA , something like:

> "Setting up your project now , a **one-time setup, usually ~4-6 minutes total**, in two parts. You can step away and come back in about **6 minutes**.
>
> **Part 1 , provisioning (~2-4 min):**
> 1. **GitHub repo** , create + clone (~5-15s)
> 2. **Lakebase database** , provision Postgres + resolve the endpoint (~30-90s)
> 3. **Project files** , scaffold the app + `.consort/` + wire E2E (~5-10s)
> 4. **CI service principal** , the workflow identity (~5-15s)
> 5. **Self-hosted CI runner** , download + register + start it (**~1-2 min , the slow one; looks quietest, that's normal**)
> 6. **Staging tier** , cut the paired Lakebase + git branch (~20-40s) *(only for `--tiers 2`/`3`)*
> 7. **Initial commit + push** (~5-15s)
>
> **Part 2 , Consort toolkit download (~1-2 min):** right after create I run `./scripts/lk --refresh`, which downloads the kit + its dependencies **once** for this version (instant on every command after). This is deliberately separate from create , it's a heavy download, so we do it once at a reliable point rather than risk it mid-provision.
>
> I'll narrate each step as it happens and ping you the moment it's done (or if anything needs you)."

Tune to the options (drop step 6 on `--no-github`/`--tiers 1`; a cold toolkit download over a slow network can push Part 2 to ~2-3 min).

**Run it in the BACKGROUND and relay each stage live , do NOT run it as a blocking foreground call.** `lakebase-create-project` streams one `[stage] detail` line to stderr per step (`[Creating GitHub repository...]`, `[Creating Lakebase database (provisioning Postgres, ~30-60s)...]`, `[Scaffolding project files...]`, `[Setting up CI auth (service principal)...]`, `[Setting up the self-hosted CI runner ...]`, `[Cutting staging tier ...]`, `[Creating initial commit...]`, `[Project created successfully!]`). A blocking foreground run holds all of that until the command returns, so the human sees a spinner for ~3 minutes and NOTHING else , which is exactly the "it looks hung / I can't see what's going on" failure the timeline above is meant to prevent. The narration promise is only deliverable if you background the command to a log and tail that log, relaying each new `[stage]` line to the human as it appears (the same live-relay you use for `/sprint`). Run the command as `<cmd> > "$LOG" 2>&1 &`, capture the PID, then poll/tail `$LOG` and surface each `[...]` line until the process exits; on exit, relay the final `Next:` hint.

```bash
# Pin the create-project to THIS plugin's own version so a fresh install ALWAYS
# scaffolds a coherent project , the create-project, launcher (consort.sh), kit-ref,
# and scm-utils-ref all resolve to the version you installed, never a stale npx
# cache or the mutable `main` branch. Precedence:
#   1. LAKEBASE_KIT_REF            (explicit override; dev / capture)
#   2. the running plugin's version (read from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json)
#   3. KIT_VERSION_AT_RELEASE       (stamped into this command at release; the reliable floor)
KIT_REF="${LAKEBASE_KIT_REF:-}"
if [ -z "$KIT_REF" ] && [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" ]; then
  KIT_REF="v$(node -p "require('${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json').version" 2>/dev/null || true)"
fi
KIT_REF="${KIT_REF:-v0.3.23}"   # stamped at release; == package.json version (enforced by tests/bdd/start-kit-pin.test.ts)
KIT_PKG="github:databricks-solutions/consort#${KIT_REF}"

# Background it to a log so you can relay the [stage] lines live (see above).
# Do NOT run this as a blocking foreground call , the human would see only a
# spinner for the whole ~3 min provisioning wait.
LOG="$(mktemp -t consort-create.XXXX.log)"
npx --yes --package="$KIT_PKG" lakebase-create-project \
  --project-name "<name>" --parent-dir "<parent-dir>" \
  --databricks-host "<host>" --github-owner "<owner>" \
  --language "<language>" --tiers "<1|2|3>" \
  (--ui-track|--no-ui-track) \
  [--no-github] [--enable-e2e|--no-e2e] [--enable-infra|--no-infra] \
  [--agent-model <role>=<model> ...] > "$LOG" 2>&1 &
CREATE_PID=$!
# Now tail "$LOG" and relay each new `[stage]` line to the human until
# CREATE_PID exits; the final line is the `Next:` hint + a JSON result.
```

**Environment gate.** Before provisioning anything, `lakebase-create-project`
runs the environment doctor (tool prerequisites + that the target workspace has
Lakebase enabled) and refuses to start if a hard check fails, printing what to
fix. If it stops here, relay the doctor's findings to the human and have them fix
the environment, then re-run; do not pass `--skip-doctor` to force past a real
failure (it only exists for the rare case the human has already verified the
environment another way).

On success, tell the user to enter the new project, refresh its runtime kit, and resume:

```
cd <parent-dir>/<name>
./scripts/lk --refresh    # re-download the Consort toolkit fresh so this project runs the release you just installed, not a stale shared cache
```

**`--refresh` is the other multi-minute step , relay it live the same way, not foreground.** It narrates its own download ("Downloading the Consort toolkit … one-time, ~1-2 min … ready"), but a blocking foreground run buffers that behind a spinner exactly like create does. Background it to a log and tail it (`./scripts/lk --refresh > "$LOG" 2>&1 &`), relaying the "Downloading …" / "ready" lines, so the ~1-2 min toolkit download is narrated, not silent. If YOU (the operator) run it on the user's behalf rather than having them run it, this is required; if you hand the command to the user to run themselves, tell them it's a one-time ~1-2 min download that will print progress.

then re-run **`/consort:start`** there (it will find `.consort/` and resume at `/plan`), or `./scripts/consort.sh plan` to open the orchestrator session directly. Do not start the workflow from the current directory, the project is elsewhere.

### Offer the Consort viewer extension (fresh project, before the first phase)

When you hand off to the first workflow step (`/plan`, `/sprint`, `/design`, or `/spike`) on a **freshly created** project, also encourage the **Consort VS Code / Cursor extension** , a live viewer that shows the workflow as it runs (paired branches, phase/gate state, per-role progress), which is much nicer than watching a terminal. Offer to set it up for them:

> "Consort has a VS Code / Cursor extension that shows the run live , branches, gates, and each role's progress. Want me to install it and open your editor on the project?"

**First check whether they even have an editor**, then, if yes, do it for them (download the latest release `.vsix`, install, open the project). The `cursor` / `code` CLI is often NOT on PATH even when the app IS installed (users skip the editor's "Install command in PATH" step), so fall back to the macOS app-bundle CLI before concluding it's missing:
```bash
# Find a usable Cursor/VS Code CLI: PATH first, then the installed .app's bundled CLI.
find_editor() {
  for c in cursor code; do command -v "$c" >/dev/null 2>&1 && { echo "$c"; return; }; done
  for p in "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
           "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
           "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
           "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
}
ED="$(find_editor)"
if [ -z "$ED" ]; then
  echo "Neither Cursor nor VS Code found. Install one, then the extension (manual steps below)."
else
  mkdir -p /tmp/consort-ext
  # latest release .vsix from the extension repo (not on the marketplace)
  gh release download --repo databricks-solutions/lakebase-scm-extension \
    --pattern '*.vsix' --dir /tmp/consort-ext --clobber
  "$ED" --install-extension /tmp/consort-ext/*.vsix
  "$ED" "<parent-dir>/<name>"                          # open the PROJECT dir with the extension active
fi
```
- **Confirm which editor** if both are present (prefer the one they're using). The app-bundle fallback means an installed-but-not-on-PATH editor still works; if you used the bundle path, mention they can enable the short command via the editor's *"Shell Command: Install 'code'/'cursor' command in PATH"*.
- **If neither is installed**, don't force it: point them to install Cursor or VS Code, then the manual path , download the `*.vsix` from `https://github.com/databricks-solutions/lakebase-scm-extension/releases/latest` and use the editor's **Extensions → ⋯ → Install from VSIX**, then open the project folder.
- This is an **offer, not a gate** , if they decline, continue straight to the chosen workflow step. Only offer it once, on the fresh-project hand-off.

---

## Note on the orchestrator

The orchestrator is the deterministic driver (`consort-drive`), not an LLM agent: the slash commands invoke it, and IT spawns the role agents + pauses at gates. `/consort:start` (this command) helps you pick + run the right command from your session; the project's `./scripts/consort.sh` is the equivalent local launcher.
