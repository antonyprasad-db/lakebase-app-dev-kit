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
     2. Move THIS project onto that version , the plugin update does NOT touch a project's runtime kit: write the new version tag into `.lakebase/kit-ref` (e.g. `printf 'vX.Y.Z\n' > .lakebase/kit-ref`) then `./scripts/lk --rewarm` to install it. Because the ref is version-keyed, this is a one-time fresh install; future runs are instant.
   - **Older project pinned to `main` (or no `.lakebase/kit-ref`)?** That's the legacy, drift-prone case: `./scripts/lk --warm` only reinstalls if `main`'s tip moved and the fast path otherwise serves whatever it first cached. Pin it to a real version once , `printf 'v<current>\n' > .lakebase/kit-ref && ./scripts/lk --rewarm` , and it stops drifting. The drive auto-refreshes the project's `.claude/agents/` when it detects the kit changed; to refresh out of band run `./scripts/lk lakebase-update-agents`.
2. **Continue the loop.** Offer the human the autonomous path or a single step:
   - **Whole sprint (autonomous):** **`/sprint [name]`** flows plan -> per feature `design` -> `build` -> `deploy`, pausing only at gates. Resumable; re-invoke to continue past an approved gate.
   - Or one phase at a time (lowest-ready first):
     - No sprint backlog (or the last sprint shipped) -> **`/plan`** (Spec Author proposes; the PO authors the next sprint's requests, folding in what the last working software revealed).
     - A feature has a `feature-request.md` but no conformant `test-list.json` -> **`/design <feature-id>`**.
     - Designed but not built -> **`/build <feature-id>`**.
     - Built but not deployed/reviewed -> **`/deploy <feature-id> --target local`** (the working-software gate).
   - Need to explore an unknown first? **`/spike <slug> [--for <feature>]`** (throwaway, outside the loop).
   - Confirm the chosen step with the human, invoke that project-scaffolded command (it runs the deterministic driver, which spawns the role agents + pauses at gates), then loop.

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
- **If they pick the example:** most create settings are FIXED for it (language `python`, `--ui-track` on, E2E on, model profile **Default**), so the ONLY things left to ask are:
  - **project name** (kebab-case), **parent directory** (default: the parent of cwd, else `~/code`), and **Databricks host** (offer `$DATABRICKS_HOST` / `~/.databrickscfg`). These are FREE TEXT: ask them in plain prose, and do NOT put them through a multiple-choice question (that is what triggers an "Invalid tool parameters" error: a text answer has no options).
  - **GitHub owner, or `--no-github`**: the one genuine either/or, and it sets the tier count. A GitHub owner ⇒ tiers `2` (prod + staging); `--no-github` ⇒ tiers `1` (prod only). This is the only decision worth a structured choice.

  Then create the project (below), `cd` in, **refresh the project's runtime kit to the current release**, and bring in the seed files with the kit bin:
  ```bash
  ./scripts/lk --rewarm                        # force-fresh the runtime kit (avoids a stale shared cache from an earlier project)
  ./scripts/lk lakebase-stage-first-project
  ```
  The `--rewarm` matters: the runtime kit is cached per-ref in a shared location (`~/.cache/consort/<ref>`), so a project created after you last used an OLDER kit can otherwise run that stale cache and miss newly-added bins like `lakebase-stage-first-project`. `--rewarm` reinstalls it unconditionally, so the project runs the kit you just installed. (If `--rewarm` reports the bin still missing, your Consort plugin itself is behind , update it per "Check for a newer Consort" above , then re-run.)
  It copies the example's intake (`product-overview.md`, `nfrs.md`, `design-brief.md`, and the warehouse icon) and one `feature-request.md` per feature into the new project's `.consort/`. Then resume: **`/plan`** (the Spec Author proposes a sprint from the staged intake), or **`/design F1-stock-visibility`** to jump straight into the first feature. `examples/first-project/README.md` in the kit is the walkthrough.
- **If they pick their own project:** proceed with the questions below as normal.

Walk the user through the create questions (ask, do not assume; offer the noted defaults). Most of these are FREE TEXT (project name, parent directory, Databricks host, GitHub owner): ask them in plain prose. Reserve a structured multiple-choice prompt only for the genuine either/or decisions (tiers 1/2/3, language, E2E on/off, model profile); never wrap a free-text answer in an options prompt (it errors with "Invalid tool parameters").

- **Project name** (kebab-case, the Lakebase id + dir name; on the `--no-github` path the creator makes the target directory, or reuses an existing EMPTY one, but refuses a non-empty directory); **parent directory** (default: parent of cwd or `~/code`); **Databricks host** (offer `DATABRICKS_HOST` / `~/.databrickscfg` if present); **GitHub owner** (or `--no-github`); **tiers** (`1` prod / `2` prod+staging / `3` prod+staging+dev, surface this, do not pick silently; **tiers `2`/`3` require a GitHub repo**, cutting a long-running tier pushes its git side to origin, so `--no-github` with `--tiers 2`/`3` is refused up front, pair `--no-github` with `--tiers 1`); **language** (`python`/`nodejs`/`java`/`kotlin`); **E2E/Infra** (default on for nodejs); **model profile** (see "Per-role model profile" just below).

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

Then run the kit's creator (surface the exact command first; report its output, which prints a `Next:` hint):

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
KIT_REF="${KIT_REF:-v0.3.17}"   # stamped at release; == package.json version (enforced by tests/bdd/start-kit-pin.test.ts)
KIT_PKG="github:databricks-solutions/consort#${KIT_REF}"
npx --yes --package="$KIT_PKG" lakebase-create-project \
  --project-name "<name>" --parent-dir "<parent-dir>" \
  --databricks-host "<host>" --github-owner "<owner>" \
  --language "<language>" --tiers "<1|2|3>" \
  [--no-github] [--enable-e2e|--no-e2e] [--enable-infra|--no-infra] \
  [--agent-model <role>=<model> ...]
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
./scripts/lk --rewarm    # force-fresh the runtime kit so this project runs the release you just installed, not a stale shared cache
```

then re-run **`/consort:start`** there (it will find `.consort/` and resume at `/plan`), or `./scripts/consort.sh plan` to open the orchestrator session directly. Do not start the workflow from the current directory, the project is elsewhere.

---

## Note on the orchestrator

The orchestrator is the deterministic driver (`consort-drive`), not an LLM agent: the slash commands invoke it, and IT spawns the role agents + pauses at gates. `/consort:start` (this command) helps you pick + run the right command from your session; the project's `./scripts/consort.sh` is the equivalent local launcher.
