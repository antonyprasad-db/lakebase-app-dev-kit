# Shipped step manifests

Each `*.json` here is the DATA face of one orchestrator step (the Template-Method
`StepExecutor` drives the fixed phases; only validator bodies + the agent spawn stay
code). A manifest declares the step's `inputs`, `outputs`, `routing`, `agentOptions`,
and optional `postTurn` CLIs. They are inlined into the build via `SHIPPED_MANIFESTS`
in `../manifest.ts` and validated against `../../config/schemas/step-manifest.schema.json`.

## Output channels (contained vs uncontained)

Every `outputs[].channel` answers ONE question: **does this file belong in the shared,
uncontained code tree, or in a root the orchestrator contains?** The canonical
explanation lives in `../step-contract.ts` (the "OUTPUT CHANNELS" note on
`StepOutputSpec`); the resolver is `../../provisioning/channels.ts`. In short:

| channel | what | placed under | contained? |
|---|---|---|---|
| `product` | app code, tests, migrations , accumulates across build turns and ships | `workspaceDir` (project root) | never (uncontained) |
| `artifact` | the `.consort` design docs (feature-spec, architecture, db-design, test-list, design-guide, acs, estimates, proposals) | `artifactDir` if provisioned, else `workspaceDir` | may be |
| `meta` | orchestration bookkeeping about the turn (the reconciled agent-log, reflect verdict, assess marker) | `metaDir` if provisioned, else `workspaceDir` | yes |
| *(absent)* | legacy single-root turn | `workspaceDir` | , (byte-identical to a pre-channel turn) |

### Authoring rules

1. **Tag the channel** on every declared output (omit only for a legacy single-root turn).
2. **Keep `filename` channel-RELATIVE** , the path WITHIN that channel's root, e.g.
   `feature-spec.json`, `agent-log.jsonl`, `app`, `tests`. **Never** prefix it with
   `.consort/` or the project root: the orchestrator prepends the channel root, and a
   leading `.consort/` double-encodes it (`.consort/.consort/...`) once `artifactDir` /
   `metaDir` are provisioned.
3. **The orchestrator places the file.** `resolveChannelRoot(channel, roots)` joins the
   filename under the right root; the live drive provisions `artifactDir = metaDir =
   <project>/.consort` (see `../../drive/executor-dispatch.ts` `outputPathsForAction` +
   `provisionWorkspace`). A run that provisions neither contained root is byte-identical
   to a single-root turn , which is why an untagged manifest keeps working.

### Examples in this directory

- `spec-author-breakdown.json` , `feature-spec` (artifact) + `agent-log` (meta).
- `navigator-red.json` , `tests` (product, at the project root) + `agent-log` (meta).
- `driver-green.json` , `code`/app (product) + `agent-log` (meta).
- The build navigator/driver turns (`navigator-review`, `driver-refactor`, the
  `*-superseded` / `*-deploy` variants) declare **no** outputs: they are verified by the
  post-turn `@build-cycle` cycle records, not by a static artifact, so there is nothing
  to channel-tag.
