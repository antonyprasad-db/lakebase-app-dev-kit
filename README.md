<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/consort-lockup-white.svg">
    <img src="docs/logo/consort-lockup.svg" alt="Consort" width="340">
  </picture>
</p>

**Consort builds software with a coordinated ensemble of AI agents, spec-first and test-driven, on live branches of a real Lakebase database.**

Taking a page from the field of music, a *consort* is an ensemble that plays in concert: each musician holds one part, and a conductor keeps them in time. Consort is that, applied to building software. A set of agents each take on one familiar role from the software lifecycle, a product owner, a spec author, an architect, a DBA, a test strategist, a UX designer, and a navigator/driver pair at the keyboard, while a deterministic conductor keeps them in sequence and a human approves every gate. No agent plays another's part, and the one that writes the code is never the one that judges it.

What keeps the ensemble honest is where it plays. Every red/green/refactor cycle runs against a live, copy-on-write branch of a real, governed Lakebase database, never a mock. A step is "green" only when a real test runner passes against real data; the human-in-the-loop gates fail closed; and within a unit of work the tests cannot be edited to force a pass.

## The ensemble

Each agent owns one concern and communicates only through the artifacts it produces and the ones it consumes, in the order a lifecycle would run them. No shared memory, one job each: the spec the Spec Author produces is what the Architect Reviewer reads, whose contract the DBA and Test Strategist build on in turn.

| Agent | Lifecycle role | Owns |
|---|---|---|
| **Product Owner** | Product | the backlog and each story's acceptance criteria |
| **Spec Author** | Analysis | the structured, testable specification |
| **Architect Reviewer** | Architecture | the layering lens, NFRs, and the persistence invariants |
| **DBA** | Data | the physical schema and the per-story migration plan |
| **Test Strategist** | Test design | the ordered master test list drawn from the ACs |
| **UX Designer** | Experience | the interface design, for user-facing work |
| **Navigator** | Test + review | the failing test (RED), and review of the code that answers it |
| **Driver** | Implementation | the minimal honest code (GREEN), then the refactor |

## How it works

Consort runs as a loop of small increments, `/plan -> /design -> /build -> /deploy`, and a human decides every gate:

- **Design (spec-first).** Intent becomes a specification and the list of tests that will demonstrate it, then freezes at a hashed gate so the target cannot move mid-build. The Spec Author, Architect Reviewer, DBA, and Test Strategist each add their part (plus the UX Designer for user-facing work).
- **Build (test-driven).** The Navigator writes a failing test; the Driver makes it pass with the least honest code, then refactors, each cycle against a copy-on-write branch of real data. A failed verify routes to a bounded repair that never touches the tests.
- **Deploy + promote (deterministic).** The conductor, not an agent, deploys and verifies the increment and drives the PR, CI, merge, and parent-tier migration. The human approves the deploy and promote gates.

Routing between phases is a program, not a model's choice, so the loop cannot drift, be argued out of a step, or be lost across a context reset.

## What's in this repo

- **`scripts/sftdd/`** the deterministic conductor and the per-role logic: the drive loop, design/build routing, the gates, experiments and spikes, bad-smell detection, and agent logging.
- **`skills/consort/`** the agent-facing contract (`SKILL.md`), the eight role-agent prompts under `agents/`, and its references. Plus the engineering-canon skills (`software-design-principles`, `architectural-design-principles`, `ui-ux-design-principles`) the roles import, and the vendored Databricks skills (`databricks-core`, `databricks-lakebase`).
- **`templates/`** the `.sftdd/` bootstrap and the project-level `.claude/commands` a scaffolded project carries.
- **`apps/mcp-server/`** a single MCP server exposing the tool surface to MCP-capable agents (Claude Desktop, OpenAI Codex, Cursor-via-MCP, Genie Code).
- **`tools/openai-foundry/`** a pre-rendered OpenAI Foundry / Codex tool spec, generated from the same `apps/mcp-server/tools.ts` registry.
- **`tests/`** Vitest BDD tests. Live Lakebase paths skip cleanly when the `LAKEBASE_TEST_*` env vars are not set.

A scaffolded project keeps its live state under `.sftdd/` (`features/`, `experiments/`, `spikes/`, `cycles/`, `workflow-state.json`, `smells.json`), where the conductor reads and writes as the loop runs.

## Skills

Consort ships its own skill plus the engineering canon its roles import.

- **[`consort`](skills/consort/README.md)** the framework itself: the `/design` and `/build` lanes, the role agents, and the gates.
- **[`software-design-principles`](skills/software-design-principles/SKILL.md)** SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by the roles.
- **[`architectural-design-principles`](skills/architectural-design-principles/SKILL.md)** system-level canon: layered architecture, ports and adapters, twelve-factor, evolutionary architecture and database design.
- **[`ui-ux-design-principles`](skills/ui-ux-design-principles/SKILL.md)** experience-level canon for the UX Designer and any user-facing build.
- **Vendored** `databricks-core` and `databricks-lakebase` are read-only mirrors of [`databricks/devhub`](https://github.com/databricks/devhub/tree/main/.agents/skills) (the `databricks postgres` CLI surface). Refresh with `npm run sync:devhub` (drift-checked in CI via `npm run check:devhub`).

## Install and use

### As a Claude Code plugin

```bash
claude plugin marketplace add databricks-solutions/consort
claude plugin install consort@databricks-solutions
```

Then, in any session:

```
/consort:start
```

In a project that already has a `.sftdd/` directory this resumes the `/plan -> /design -> /build -> /deploy` loop; elsewhere it walks you through creating a project first, then resumes. The command, skills, and MCP server ship in the plugin; the role agents are scaffolded into your project's `.claude/agents/` and spawned by the conductor (`lakebase-sftdd-drive`) as `claude --agent <role>`, pausing at every gate.

### As skills for other agents

`install.sh` copies the skill trees under `skills/` into the path each agent reads from, pulling the latest vendored skills first (best-effort; skipped offline). It auto-detects installed agents; `--tools` overrides.

```bash
# Auto-detect installed agents, prompt to pick
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/consort/main/install.sh)

# Specific targets
./install.sh --tools claude,cursor

# Upload skills into a Databricks workspace for Genie Code
./install.sh --install-to-genie --profile DEFAULT
```

Targets: **Claude Code** (`.claude/skills/`), **Cursor** (`.cursor/skills/`), **Databricks Genie Code** (workspace upload), and **Claude Desktop / OpenAI Codex** via the MCP manifest at `.mcp.json` (the server lives at `apps/mcp-server/`, also on PATH as `lakebase-mcp-server`). **OpenAI Foundry** consumes the pre-rendered spec at [`tools/openai-foundry/consort.tools.json`](tools/openai-foundry/consort.tools.json). `manifest.json` is a machine-readable index of every skill and its files (regenerated by `python3 scripts/skills.py`).

### From a clone

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

The bins are Consort's command surface plus a few project-lifecycle helpers. Run any with `--help`.

- **`lakebase-sftdd-drive`** the deterministic conductor: routes the design/build/deploy/promote phases, spawns the role agents, and holds the gates. The `lakebase-sftdd-*` family (`-intake`, `-cycle`, `-experiment`, `-spike`, `-deploy`, `-approve-gate`, `-gate-conformance`, `-next`, `-test-list`, `-human-proxy`, ...) are its building blocks.
- **`lakebase-create-project`** end-to-end Lakebase-paired project bootstrap that also scaffolds the Consort commands.
- **`lakebase-adopt-sftdd`** add Consort to an existing Lakebase-paired project.
- **`lakebase-feature-status`** report where each feature sits in the loop.
- **`lakebase-update-commands`** refresh a scaffolded project's `.claude/commands` to the current version.
- **`lakebase-mcp-server`** stdio MCP server exposing the tool surface to MCP-capable agents.

## Contributing

Maintainer-facing docs (development setup, build, test tiers, the single-seam contributor rule, release flow, and the pull-request checklist) live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

Databricks does not offer official support for content in this repository. For questions or bugs, please open a GitHub issue and the team will help on a best-effort basis.

## License

See [LICENSE.md](LICENSE.md).
