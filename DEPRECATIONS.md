# Deprecations

This file tracks Consort surfaces that are deprecated but still functional, and
the release in which each is scheduled for removal. Deprecated surfaces keep
working until their removal version and emit a one-time runtime warning when
used, so existing projects have a migration window.

## Legacy `sftdd` / `tdd` names — removed in **v0.4.0**

Consort was previously shipped as the `lakebase-sftdd-workflows` skill (and, before
that, `lakebase-tdd-workflows`). The rename to **Consort** kept the old names alive
for back-compat. They are now deprecated:

| Deprecated surface | Replacement | Warning site |
| --- | --- | --- |
| Bin aliases `lakebase-sftdd-*`, `lakebase-tdd-*` | the `consort-*` / `lakebase-*` bins (same behavior) | the scaffolded `scripts/lk` launcher warns on a legacy alias |
| Env prefixes `LAKEBASE_SFTDD_*`, `LAKEBASE_TDD_*` | `LAKEBASE_CONSORT_*` (same suffix) | the `consortEnv()` resolver warns once per legacy name |

Both are still honored today: the bin aliases point at the same CLIs as the
canonical names, and `consortEnv()` still falls back through the legacy prefixes
(newest-first) so no exported value is lost. Migrate at your convenience:

- Replace `lakebase-sftdd-<x>` / `lakebase-tdd-<x>` invocations with `consort-<x>`
  (or the `lakebase-<x>` name for project-lifecycle bins).
- Rename any exported `LAKEBASE_SFTDD_<X>` / `LAKEBASE_TDD_<X>` to
  `LAKEBASE_CONSORT_<X>`.

In **v0.4.0** the aliases and the legacy env prefixes will be removed; only the
`consort-*` / `lakebase-*` bins and the `LAKEBASE_CONSORT_*` prefix will resolve.

> History that will NOT change: past `CHANGELOG.md` entries and recorded replay
> corpora reference the old names because that is what those releases and
> recordings were. Those are not deprecations, just history.
