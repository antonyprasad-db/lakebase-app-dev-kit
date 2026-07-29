// Front-door doctor gate for project creation.
//
// A good diagnostic (lakebase-doctor) has existed in the substrate, but nothing
// on the create path ran it, so the first sign of a bad environment (wrong Node,
// no JDK, a workspace without Lakebase) was a failure partway through
// provisioning a repo + a database. This gate runs the doctor BEFORE any
// irreversible provisioning and refuses to start when a hard prerequisite is
// missing, converting a confusing mid-provision crash into a clear, actionable,
// up-front message.

// The substrate barrel aliases the health-doctor (the {name,status,message,hint}
// check runner from doctor.ts) to runHealthDoctor / HealthDoctorReport, because
// the plain `runDoctor` / `HealthDoctorReport` names are taken by the scm-doctor
// (findings/severity). We want the health doctor here.
import {
  runHealthDoctor,
  type HealthDoctorReport,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

// The barrel exports HealthDoctorReport but not its element type, so derive it.
export type CheckResult = HealthDoctorReport["checks"][number];

export interface CreateDoctorGateArgs {
  /** Where the project will be created (the doctor inspects the environment; the
   *  project dir does not exist yet, so we point it at the parent). */
  parentDir: string;
  /** Target workspace host, so the lakebase-enabled probe checks the RIGHT one. */
  databricksHost: string;
  /** Explicit profile, if the caller pinned one. */
  profile?: string;
  /** Injectable for tests; defaults to the real runDoctor. */
  doctor?: (args: { projectDir: string; host: string; profile?: string }) => Promise<HealthDoctorReport>;
}

export interface CreateDoctorGateResult {
  ok: boolean;
  report: HealthDoctorReport;
  /** The checks that blocked (status "fail"). Empty when ok. */
  blockers: CheckResult[];
}

/**
 * The doctor checks that must PASS before creation may start. A "fail" on any of
 * these blocks provisioning; "warn" and "skip" do not (a warning is advisory,
 * and skips happen for checks that need a project that does not exist yet).
 *
 * Scoped to the cold-start environment: the tool prerequisites and, critically,
 * that the target workspace actually has Lakebase enabled. Project-state checks
 * (env-file, git-remote, lakebase-project, workflow-drift) are intentionally NOT
 * blockers here: they describe a project that create is about to make, so they
 * cannot pass pre-creation and must not gate it.
 */
export const CREATE_GATE_BLOCKING_CHECKS = new Set<string>([
  "databricks-cli",
  "databricks-auth",
  "workspace-identity",
  "lakebase-enabled",
  "node",
  "npm",
  "python",
  "jdk",
  "gh",
]);

/**
 * Run the doctor and decide whether creation may proceed. A check blocks only
 * when it is BOTH in CREATE_GATE_BLOCKING_CHECKS and reports "fail".
 */
export async function runCreateDoctorGate(
  args: CreateDoctorGateArgs
): Promise<CreateDoctorGateResult> {
  const doctor =
    args.doctor ??
    ((a) => runHealthDoctor(a));
  const report = await doctor({
    projectDir: args.parentDir,
    host: args.databricksHost,
    profile: args.profile,
  });
  const blockers = report.checks.filter(
    (c) => c.status === "fail" && CREATE_GATE_BLOCKING_CHECKS.has(c.name)
  );
  return { ok: blockers.length === 0, report, blockers };
}

/** Render the blockers as a human-readable, actionable message for the CLI. */
export function formatGateBlockers(blockers: CheckResult[]): string {
  const lines = [
    "Environment preflight failed. Fix these before creating a project:",
    "",
  ];
  for (const b of blockers) {
    lines.push(`  ✗ ${b.name}: ${b.message}`);
    if (b.hint) lines.push(`      → ${b.hint}`);
  }
  lines.push("");
  lines.push("Re-run `lakebase-doctor` to recheck, or pass --skip-doctor to bypass (not recommended).");
  return lines.join("\n");
}
