// Drive-startup auth preflight (fail-fast on an expired Databricks session).
//
// The drive spawns expensive LLM turns + does DB-backed verifies. If the
// Databricks OAuth refresh token is expired, credential minting fails DEEP
// inside a test's DB connection , where it degrades into a hang, and the drive
// spins for hours (assess -> repair loops on a failure that can never clear).
//
// This runs ONCE at drive startup and exercises the REFRESH token via
// scm-utils's checkDatabricksAuth (`databricks auth token --force-refresh`), so
// a dead session halts the run immediately with the `databricks auth login`
// remediation , BEFORE any agent spawn. It is the single cheap gate that turns
// that latent multi-hour spin into a second-zero, actionable failure.

import { checkDatabricksAuth, databricksAuthPrereqMessage } from "@databricks-solutions/lakebase-scm-utils/lakebase";

export interface DriveAuthPreflightResult {
  ok: boolean;
  /** The actionable remediation, present only when ok is false. */
  message?: string;
}

/** The auth probe seam (scm-utils checkDatabricksAuth). Injectable for tests. */
export type AuthCheck = (host?: string) => Promise<{ ok: boolean; reason?: string }>;

/**
 * Fail-fast auth preflight for the drive. Returns ok:true when the Databricks
 * session is live (refresh token valid), else ok:false with the reauth message.
 * `check` defaults to scm-utils's refresh-exercising checkDatabricksAuth; tests
 * inject a stub. `host` is threaded through for the remediation hint.
 */
export async function driveAuthPreflight(
  host?: string,
  check: AuthCheck = checkDatabricksAuth,
): Promise<DriveAuthPreflightResult> {
  const res = await check(host);
  if (res.ok) return { ok: true };
  return { ok: false, message: databricksAuthPrereqMessage(host, res.reason) };
}
