# Consort

**Consort is a Spec-First Branched-Database TDD agent framework: it governs what an AI agent writes by construction.** A deterministic orchestrator drives a set of separate role agents through a spec-first design lane and a test-driven build lane whose every red/green/refactor cycle runs against a live, copy-on-write branch of a real, governed Lakebase database. The controls are code the agent runs inside but cannot edit: human-in-the-loop gates fail closed, tests are immutable within a unit of work, and a green result is defined as a test runner actually passing against real data, not the agent's report that it passed.

## How it works

The workflow runs as a loop of increments, `/plan -> /design -> /build -> /deploy`, with a human deciding every gate:

- **Design lane (spec-first).** Intent is captured in a specification and a list of the tests that will demonstrate it, then frozen at a hashed gate so the target cannot move mid-build. Eight role agents each own a bounded concern: product owner, spec author, architect reviewer, DBA, test strategist, UX designer (for user-facing work), and the navigator/driver pair that run the build cycle. No role can do another's job and roles share no memory, so the agent that writes the code is never the one that judges it.
- **Build lane (Branched-Database TDD).** The full red/green/refactor cycle runs against a copy-on-write branch of real, governed data. A green result is stamped only when the test runner actually passes; a failed verify routes to a bounded code repair that never touches the tests, or, when a later story legitimately supersedes a prior test, to a rule-bound refactor of only the superseded tests.
- **Deploy + promote (deterministic).** These phases are run by the orchestrator itself, not an agent: it deploys/verifies the increment and drives the PR, CI, merge, and parent-tier migration. The human approves the deploy and promote gates.

Routing between phases is a program, not a model decision, so the control loop cannot drift or be argued out of a step, and it cannot be lost across context compaction.

## What is in this repo

- **`scripts/sftdd/`** the deterministic orchestrator and the per-role logic: the drive loop, design/build routing, the gates, experiments and spikes, bad-smell detection, and agent logging.
- **`skills/consort/`** the framework's agent-facing contract (`SKILL.md`), the eight role-agent prompts under `agents/`, and its references. Plus the shared engineering canon skills (`software-design-principles`, `architectural-design-principles`, `ui-ux-design-principles`) that the roles import, and the vendored Databricks skills (`databricks-core`, `databricks-lakebase`).
- **`templates/`** the `.sftdd/` workflow bootstrap and the project-level `.claude/commands` a scaffolded project carries.
- **`apps/mcp-server/`** a single MCP server exposing the tool surface to MCP-capable agents (Claude Desktop, OpenAI Codex, Cursor-via-MCP, Genie Code).
- **`tools/openai-foundry/`** a pre-rendered OpenAI Foundry / Codex tool spec, generated from the same `apps/mcp-server/tools.ts` registry.
- **`tests/`** Vitest BDD tests. Live Lakebase paths skip cleanly when `LAKEBASE_TEST_*` env vars are not set.

The scaffolded `.sftdd/` runtime dir (`features/`, `experiments/`, `spikes/`, `cycles/`, `workflow-state.json`, `smells.json`) is where a project's live workflow state is read and written.

## Skills

Consort ships its framework skill and the engineering canon its roles import.

- **[`consort`](skills/consort/README.md)** the framework itself: the `/design` and `/build` lanes, the role agents, and the gates.
- **[`software-design-principles`](skills/software-design-principles/SKILL.md)** SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by the framework roles.
- **[`architectural-design-principles`](skills/architectural-design-principles/SKILL.md)** system-level canon: layered architecture, ports and adapters, twelve-factor, evolutionary architecture and database design.
- **[`ui-ux-design-principles`](skills/ui-ux-design-principles/SKILL.md)** experience-level canon for the UX Designer and any user-facing build.
- **Vendored** `databricks-core` and `databricks-lakebase` are read-only mirrors of [`databricks/devhub`](https://github.com/databricks/devhub/tree/main/.agents/skills) (the `databricks postgres` CLI surface). Refresh with `npm run sync:devhub` (drift-checked in CI via `npm run check:devhub`).

## Install and use

### As a Claude Code plugin (the workflow)

```bash
claude plugin marketplace add databricks-solutions/consort
claude plugin install consort@consort
```

Then, in any session:

```
/consort:start
```

In a folder with a `.sftdd/` directory this resumes the `/plan -> /design -> /build -> /deploy` loop; elsewhere it guides you through creating a project, then resumes. The workflow is driven by the deterministic orchestrator (`lakebase-sftdd-drive`), which spawns the role agents scaffolded into the project's `.claude/agents/` (invoked as `claude --agent <role>`) and pauses at every HITL gate. The plugin ships the command + skills + MCP server; the role agents come from the scaffolded project, not the plugin.

### For coding agents (skills only)

`install.sh` copies the skill trees under `skills/` into the path each agent reads from, pulling the latest vendored skills first (best-effort; skipped offline). Auto-detects installed agents; `--tools` overrides.

```bash
# Auto-detect installed agents, prompt to pick
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/consort/main/install.sh)

# Specific targets
./install.sh --tools claude,cursor

# Upload skills into a Databricks workspace for Genie Code
./install.sh --install-to-genie --profile DEFAULT
```

Supported targets: **Claude Code** via `.claude/skills/`, **Cursor** via `.cursor/skills/`, **Databricks Genie Code** via workspace upload, and **Claude Desktop / OpenAI Codex** via the MCP manifest at `.mcp.json` (the server lives at `apps/mcp-server/`, also exposed as the `lakebase-mcp-server` bin). **OpenAI Foundry** consumes the pre-rendered tool spec at [`tools/openai-foundry/consort.tools.json`](tools/openai-foundry/consort.tools.json). `manifest.json` is a machine-readable index of every skill + its files (regenerated by `python3 scripts/skills.py`).

### From a clone (running the bins directly)

```bash
git clone https://github.com/databricks-solutions/consort
cd consort
npm install   # the prepare script builds dist/
```

### Prerequisites

- **Node.js 20+** and npm
- **Databricks CLI v1.0.0+**, authenticated to a workspace with Lakebase enabled (macOS: `brew upgrade databricks/tap/databricks`)
- **Python 3.10+** (for `scripts/openai-foundry.py` and the alembic venv the live driver manages)
- **GitHub CLI (`gh`)** authenticated, for self-hosted-runner setup
- **JDK 17+** for the Flyway live path (the CLI itself is auto-downloaded)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full live-test prerequisites and the `.env.template.test.config` / `.env.local.test.config` pattern.

## CLIs

The bins are Consort's workflow surface plus a few project-lifecycle helpers. Run any with `--help`.

- **`lakebase-sftdd-drive`** the deterministic orchestrator: routes the design/build/deploy/promote phases, spawns the role agents, and holds the gates. The `lakebase-sftdd-*` family (`-intake`, `-cycle`, `-experiment`, `-spike`, `-deploy`, `-approve-gate`, `-gate-conformance`, `-next`, `-test-list`, `-human-proxy`, ...) are its building blocks.
- **`lakebase-create-project`** end-to-end Lakebase-paired project bootstrap that also lays down the workflow.
- **`lakebase-adopt-sftdd`** add Consort's workflow to an existing Lakebase-paired project.
- **`lakebase-feature-status`** report the workflow state of the features in a project.
- **`lakebase-update-commands`** refresh a scaffolded project's `.claude/commands` to the current version.
- **`lakebase-mcp-server`** stdio MCP server exposing the tool surface to MCP-capable agents.

## Contributing

Maintainer-facing docs (development setup, build, test tiers, the single-seam contributor rule, release flow, and the pull-request checklist) live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

Databricks does not offer official support for content in this repository. For questions or bugs, please open a GitHub issue and the team will help on a best-effort basis.

## License

See [LICENSE.md](LICENSE.md).
