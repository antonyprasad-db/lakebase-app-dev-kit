// Map a runner-recorded per-turn TurnMeta to the OPTIONAL, content-free fields of
// a `consort.turn` span. The runner (claude-runner.recordTurnMeta) captures the
// concrete model id, effort lever, retry count, and usage of a turn; this module
// is the SINGLE place that coarsens those into the closed enums / buckets the
// allowlist permits (never the raw id, count, or any free text). Pure + tolerant:
// an absent/undefined field yields an OMITTED span field (a null column), which is
// distinct from an "unknown" bucket (a value we saw but could not classify).
//
// Grown one field per Phase-A step: A2 adds model + effort; A3 adds token_bucket;
// A4 adds retry_count. The `consort.turn` span already declares all four (optional)
// in spans.ts + TURN_SPAN_FIELDS, so this file never needs an allowlist change.

import type { TurnMeta } from "../orchestrator/drive/claude-runner.js";
import { EFFORT_VALUES, type EffortValue, type ModelValue } from "./allowlist.js";
import type { TurnSpan } from "./spans.js";

/** Coarsen a concrete model id into the MODEL_VALUES family bucket (never the exact
 *  id). Matches by family substring so it is robust to id decorations (date suffix,
 *  `system.ai.` prefix, `[1m]` window tag, etc.). An id we do not recognize buckets
 *  as "other"; an absent id yields undefined (the field is omitted from the span). */
export function bucketModel(modelId: string | undefined): ModelValue | undefined {
  if (!modelId || !modelId.trim()) return undefined;
  const m = modelId.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("fable")) return "fable";
  return "other";
}

/** Normalize a reasoning-effort lever to the EFFORT_VALUES enum. An absent/empty
 *  lever yields undefined (no lever was set , the turn ran at the model default; the
 *  span omits the field, a null column). A lever we saw but cannot classify buckets
 *  as "unknown" , distinct from "no lever". */
export function normalizeEffort(effort: string | undefined): EffortValue | undefined {
  if (!effort || !effort.trim()) return undefined;
  const e = effort.trim().toLowerCase();
  return (EFFORT_VALUES as readonly string[]).includes(e) ? (e as EffortValue) : "unknown";
}

/** Build the OPTIONAL enum/coarse fields of a `consort.turn` span from a recorded
 *  turn meta. Returns only the fields it can populate; an omitted field means the
 *  runner did not surface that datum (a null column downstream). */
export function turnSpanFieldsFromMeta(meta: TurnMeta | undefined): Partial<TurnSpan> {
  if (!meta) return {};
  const out: Partial<TurnSpan> = {};
  const model = bucketModel(meta.model);
  if (model) out.model = model;
  const effort = normalizeEffort(meta.effort);
  if (effort) out.effort = effort;
  return out;
}
