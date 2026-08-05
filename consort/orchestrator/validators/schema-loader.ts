// Shared loader + compiler for the TDD JSON schemas under scripts/sftdd/schemas/.
// Single source of schema-compilation truth so spec-sync (drift reporting) and
// artifact-conformance (gate preconditions) validate against the SAME compiled
// validators instead of each rolling their own Ajv instance. Lives in the
// validators family (its registry is the primary consumer); the schema JSON files
// stay under scripts/sftdd/schemas/ (huge bin blast radius to move) and are copied
// into dist/scripts/sftdd/schemas/ by copy-build-assets.mjs.
//
// Validators are compiled lazily and cached by schema filename: the first
// caller pays the compile, every later caller reuses it.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import Ajv, { type ValidateFunction } from "ajv";

/**
 * Resolve the schemas dir robustly across BOTH runtime layouts, since this module
 * moved out of scripts/sftdd/ but the schema JSON did not:
 *   - DIST (consumer install): with tsup `splitting:false` this module is INLINED
 *     into each consuming entry under dist/scripts/sftdd/, next to the copied
 *     `schemas/` , so `join(__dirname,"schemas")` still resolves (unchanged behavior).
 *   - SOURCE (vitest / tsx): __dirname is this file's new home under consort/…, so
 *     walk to the repo's scripts/sftdd/schemas/ instead.
 * First existing candidate wins; the historical (dist) path is first, so the
 * shipped build is byte-for-byte unchanged.
 */
function resolveSchemaDir(): string {
  const candidates = [
    join(__dirname, "schemas"), // dist: inlined consumer sits beside the copied schemas
    join(__dirname, "..", "..", "..", "scripts", "sftdd", "schemas"), // source: consort/orchestrator/validators -> repo root
  ];
  return candidates.find((d) => existsSync(d)) ?? candidates[0];
}

const SCHEMA_DIR = resolveSchemaDir();

const ajv = new Ajv({ allErrors: true, strict: false });
// Register the `date-time` format as permissive (accept any string). Several
// schemas annotate a `timestamp` with `format: "date-time"`, but Ajv ships no
// format validators, so it logged `unknown format "date-time" ignored` on every
// validation (twice per call), pure console noise. We never validated the format
// (it was ignored), so a no-op registration preserves behavior + silences it,
// with no dependency on the transitive ajv-formats.
ajv.addFormat("date-time", true);
const validatorCache = new Map<string, ValidateFunction>();

/** Read + parse a schema file from scripts/sftdd/schemas/ by filename. */
export function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
}

/**
 * Return a cached, compiled Ajv validator for a schema filename
 * (e.g. "feature.schema.json"). Compiles on first use, then memoizes.
 */
export function getValidator(name: string): ValidateFunction {
  const cached = validatorCache.get(name);
  if (cached) return cached;
  const validate = ajv.compile(loadSchema(name));
  validatorCache.set(name, validate);
  return validate;
}

/**
 * Render Ajv validation errors into short, human-readable strings like
 * `/status: must be equal to one of the allowed values`. Falls back to a
 * generic message when Ajv attached no error detail.
 */
export function formatSchemaErrors(validate: ValidateFunction): string[] {
  const errors = validate.errors ?? [];
  if (errors.length === 0) return ["schema validation failed"];
  return errors.map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${where}: ${e.message ?? "invalid"}`;
  });
}
