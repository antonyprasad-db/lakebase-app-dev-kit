# Cold-install validation (readiness evidence)

Evidence that the install-readiness work (the extended doctor + the create-path
gate + the bootstrap) actually makes a cold start crisp. Run against
`fevm-serverless-stable-ecparr` on 2026-07-30 with a local consort build
resolving the published `@databricks-solutions/lakebase-scm-utils@0.1.0-beta.10`.

This is a functional pass, not a published-plugin cold install: consort itself
was a local build (its publish is a separate, user-gated step). The only gap
from a true clean-machine install is the consort plugin not being on a registry;
every doctor + gate + provisioning path below ran as it will ship.

## Checklist

| # | Check | Result |
|---|---|---|
| 1 | `lakebase-doctor` reports every cold-start prerequisite (Node/npm/Python/JDK/gh) with `{name,status,message,hint}` | PASS (A-val live) |
| 2 | `lakebase-enabled` probe reports OK on a real Lakebase workspace | PASS (A-val live) |
| 3 | `lakebase-enabled` does NOT report OK on an unreachable/non-Lakebase workspace | PASS (A-val live, profile cleared) |
| 4 | Create gate REFUSES before provisioning when a hard check fails (bogus host, no profile) | PASS: exit 2, blockers listed (jdk/workspace-identity/lakebase-enabled), parent dir left empty |
| 5 | JDK is NOT a blocker for a python project (Flyway-only requirement) | PASS (gate unit test + live python create passed the gate with no JDK) |
| 6 | Create gate PASSES on a good environment (`[doctor] environment ok`) | PASS (live) |
| 7 | A real python project provisions end-to-end (repo skip via --no-github, Lakebase project + scaffold) | see "Live create" below |
| 8 | Teardown removes every resource this validation created | see "Teardown" below |

## Live create

Command (python, tier-1, no GitHub):

```
lakebase-create-project --project-name consort-cold-val-<ts> --parent-dir <tmp> \
  --databricks-host https://fevm-serverless-stable-ecparr.cloud.databricks.com \
  --no-github --language python --tiers 1
```

Doctor gate: **passed** (`[doctor] environment ok`), then provisioning proceeded
(local project dir + Lakebase database + scaffold).

Result: **exit 0, "Project created successfully!"**. The Lakebase project
`consort-cold-val-<ts>` was created (default branch `production`), the full
project tree scaffolded (`.env`, scripts, `.github/workflows`, `.claude/`,
python project, `.sftdd/`), and an initial commit made. One non-fatal warning:
the kit fast-CLI cache could not warm at create (a network/timing issue,
recoverable with `./scripts/lk --warm`), unrelated to the readiness work.

## Teardown

The validation is authorized to create temporary scaffolded projects and must
tear down what it creates. The Lakebase project created above was deleted after
the run (see the teardown step in the run log); the temp parent dir was removed.
Pre-existing projects were never touched.

## What this does NOT cover

- A true published-plugin cold install on a clean machine (consort unpublished
  this run). That is the gated follow-up G4.
- A full `/design -> /build -> /deploy` cycle end to end; this validates the
  install + doctor + create front door, which is what the readiness work changed.
