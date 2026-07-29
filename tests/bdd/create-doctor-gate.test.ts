// The front-door doctor gate: verify creation is blocked when a hard cold-start
// prerequisite fails, and allowed otherwise. Hermetic: the doctor is injected,
// so no real environment or workspace is touched.

import { describe, it, expect } from "vitest";
import {
  runCreateDoctorGate,
  formatGateBlockers,
  CREATE_GATE_BLOCKING_CHECKS,
  type CheckResult,
} from "../../scripts/lakebase/create-doctor-gate.js";
import type { HealthDoctorReport } from "@databricks-solutions/lakebase-scm-utils/lakebase";

function report(checks: CheckResult[]): HealthDoctorReport {
  const order = ["ok", "skip", "warn", "fail"] as const;
  const overall = checks.reduce<CheckResult["status"]>(
    (acc, c) => (order.indexOf(c.status) > order.indexOf(acc) ? c.status : acc),
    "ok"
  );
  return { overall, checks };
}

const fakeDoctor = (checks: CheckResult[]) => async () => report(checks);

describe("runCreateDoctorGate", () => {
  it("passes when all blocking checks are ok", async () => {
    const checks: CheckResult[] = [...CREATE_GATE_BLOCKING_CHECKS].map((name) => ({
      name,
      status: "ok",
      message: `${name} ok`,
    }));
    const res = await runCreateDoctorGate({
      parentDir: "/tmp/x",
      databricksHost: "https://ws",
      doctor: fakeDoctor(checks),
    });
    expect(res.ok).toBe(true);
    expect(res.blockers).toHaveLength(0);
  });

  it("BLOCKS when the lakebase-enabled probe fails (the make-or-break gate)", async () => {
    const checks: CheckResult[] = [
      { name: "databricks-cli", status: "ok", message: "" },
      { name: "lakebase-enabled", status: "fail", message: "no Lakebase", hint: "enable it" },
    ];
    const res = await runCreateDoctorGate({
      parentDir: "/tmp/x",
      databricksHost: "https://ws",
      doctor: fakeDoctor(checks),
    });
    expect(res.ok).toBe(false);
    expect(res.blockers.map((b) => b.name)).toContain("lakebase-enabled");
  });

  it("BLOCKS when a tool prerequisite (jdk) fails", async () => {
    const checks: CheckResult[] = [
      { name: "jdk", status: "fail", message: "JDK not found", hint: "brew install openjdk@17" },
    ];
    const res = await runCreateDoctorGate({
      parentDir: "/tmp/x",
      databricksHost: "https://ws",
      doctor: fakeDoctor(checks),
    });
    expect(res.ok).toBe(false);
    expect(res.blockers).toHaveLength(1);
    expect(res.blockers[0].name).toBe("jdk");
  });

  it("does NOT block on a warn, or on a non-gating project-state check that fails", async () => {
    // env-file / lakebase-project describe a project create is about to make, so
    // their failure pre-creation must not gate; a warn is advisory.
    const checks: CheckResult[] = [
      { name: "node", status: "warn", message: "Node 20.0 - kit expects 20+" },
      { name: "env-file", status: "fail", message: "no .env yet" },
      { name: "lakebase-project", status: "fail", message: "no LAKEBASE_PROJECT_ID yet" },
      { name: "lakebase-enabled", status: "ok", message: "on" },
    ];
    const res = await runCreateDoctorGate({
      parentDir: "/tmp/x",
      databricksHost: "https://ws",
      doctor: fakeDoctor(checks),
    });
    expect(res.ok).toBe(true);
    expect(res.blockers).toHaveLength(0);
  });

  it("threads the target host + parent dir to the doctor (probes the right workspace)", async () => {
    let seen: { projectDir: string; host: string } | undefined;
    await runCreateDoctorGate({
      parentDir: "/tmp/parent",
      databricksHost: "https://target-ws",
      doctor: async (a) => {
        seen = { projectDir: a.projectDir, host: a.host };
        return report([{ name: "lakebase-enabled", status: "ok", message: "on" }]);
      },
    });
    expect(seen).toEqual({ projectDir: "/tmp/parent", host: "https://target-ws" });
  });
});

describe("formatGateBlockers", () => {
  it("names each failing check, its message, and its fix hint", () => {
    const msg = formatGateBlockers([
      { name: "lakebase-enabled", status: "fail", message: "no Lakebase", hint: "enable it" },
    ]);
    expect(msg).toContain("lakebase-enabled");
    expect(msg).toContain("no Lakebase");
    expect(msg).toContain("enable it");
    expect(msg).toContain("--skip-doctor");
  });
});
