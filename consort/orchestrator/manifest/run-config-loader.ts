// run-config-loader: read an orchestration run-config JSON and resolve ${ENV:-default}
// markers against process.env, so the shipped config carries DEFAULTS anyone can override by
// setting the named env var. String leaves that look numeric/boolean are coerced (tiers -> 1,
// "true" -> true), so the resolved object is a real OrchestrationRunConfig with typed
// lifecycle configs. Secrets are NEVER in the file , tokens/hosts arrive via env at run time.
//
// This is what makes the demo "config-driven so anyone can put their own in and run it": the
// committed .run.json is the recipe + the maintainer's defaults; an operator overrides only
// what differs for their workspace/owner via the documented env vars.

import { readFileSync } from "node:fs";
import type { OrchestrationRunConfig } from "./orchestration-runner.js";

/**
 * Resolve one string against process.env:
 *   "${VAR:-default}"  -> process.env.VAR ?? "default"
 *   "${VAR}"           -> process.env.VAR, or THROW if unset (a required override)
 *   "plain"            -> unchanged
 * Only whole-string markers are supported (the config values are single markers, not
 * embedded), which keeps the contract obvious.
 */
export function resolveEnvTemplate(value: string): string {
  const withDefault = value.match(/^\$\{([A-Z0-9_]+):-(.*)\}$/s);
  if (withDefault) {
    const [, name, def] = withDefault;
    return process.env[name] ?? def;
  }
  const required = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (required) {
    const [, name] = required;
    const v = process.env[name];
    if (v === undefined) {
      throw new Error(`run-config: required env var ${name} is unset (marker "${value}" has no default).`);
    }
    return v;
  }
  return value;
}

/** Coerce a resolved string leaf to number/boolean when it clearly is one (so tiers is a
 *  number + uiTrack is a boolean in the typed config), else leave the string. */
function coerceLeaf(s: string): string | number | boolean {
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

/** Recursively resolve every string leaf's env markers + coerce. Arrays/objects walked. */
function resolveDeep(node: unknown): unknown {
  if (typeof node === "string") return coerceLeaf(resolveEnvTemplate(node));
  if (Array.isArray(node)) return node.map(resolveDeep);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = resolveDeep(v);
    return out;
  }
  return node;
}

/**
 * Load + resolve an orchestration run-config from a JSON file. Reads the file, resolves every
 * ${ENV:-default} marker against process.env, coerces numeric/boolean leaves, and returns the
 * typed OrchestrationRunConfig. Does NOT touch the cloud , it only produces the config the
 * runner will act on.
 */
export function loadRunConfig(path: string): OrchestrationRunConfig {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return resolveDeep(raw) as OrchestrationRunConfig;
}
