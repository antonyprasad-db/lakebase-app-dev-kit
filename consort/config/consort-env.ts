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

/** The consort version in which the legacy `LAKEBASE_SFTDD_*` / `LAKEBASE_TDD_*`
 *  env prefixes (and the `lakebase-sftdd-*` / `lakebase-tdd-*` bin aliases) are
 *  scheduled for removal. Surfaced in the deprecation warning below. */
export const LEGACY_REMOVAL_VERSION = "v0.4.0";

// Warn at most once per distinct legacy env name, per process. Keeps the nudge
// visible without spamming loops/captures that read the same knob every turn.
const warnedLegacyEnv = new Set<string>();

/** Read a kit env knob by SUFFIX (e.g. "LOOP" -> LAKEBASE_CONSORT_LOOP), falling
 *  back through the legacy prefixes newest-first. Prefer this over process.env.
 *  Resolving via a legacy prefix emits a one-time deprecation warning (removal is
 *  scheduled for {@link LEGACY_REMOVAL_VERSION}); the value is still returned. */
export function consortEnv(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (let i = 0; i < ENV_PREFIXES.length; i++) {
    const name = `${ENV_PREFIXES[i]}${suffix}`;
    const v = env[name];
    if (v !== undefined) {
      if (i > 0) warnLegacyEnv(name, suffix);
      return v;
    }
  }
  return undefined;
}

function warnLegacyEnv(legacyName: string, suffix: string): void {
  if (warnedLegacyEnv.has(legacyName)) return;
  warnedLegacyEnv.add(legacyName);
  try {
    process.stderr.write(
      `[deprecated] ${legacyName} is a legacy sftdd/tdd-era env name; ` +
        `use ${ENV_PREFIX}${suffix} instead (removed in consort ${LEGACY_REMOVAL_VERSION}). ` +
        `Still honored for now.\n`,
    );
  } catch {
    // A deprecation notice must never break env resolution.
  }
}
