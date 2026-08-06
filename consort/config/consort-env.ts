// Consort runtime env accessor with legacy back-compat.
//
// The kit's env knobs have been prefixed, newest-first, `LAKEBASE_CONSORT_*`
// (current, Consort era) <- `LAKEBASE_SFTDD_*` (the sftdd-skill era) <-
// `LAKEBASE_TDD_*` (the original `lakebase-tdd-workflows` skill). This accessor
// reads the CURRENT prefix and falls back through the legacy ones, so existing
// scripts / shells / scaffolded projects that still export an old name keep
// working (the same tri-read convention `resolveConsortDir` uses for the artifact-
// root rename). Prefer this over `process.env.X`. The prefix chain is the SINGLE
// source of truth for the env-var name; nothing else hardcodes it.
export const ENV_PREFIXES = ["LAKEBASE_CONSORT_", "LAKEBASE_SFTDD_", "LAKEBASE_TDD_"] as const;

/** The canonical env prefix new writes/docs should use. */
export const ENV_PREFIX = ENV_PREFIXES[0];

/** Read a kit env knob by SUFFIX (e.g. "LOOP" -> LAKEBASE_CONSORT_LOOP), falling
 *  back through the legacy prefixes newest-first. Prefer this over process.env. */
export function consortEnv(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const prefix of ENV_PREFIXES) {
    const v = env[`${prefix}${suffix}`];
    if (v !== undefined) return v;
  }
  return undefined;
}
