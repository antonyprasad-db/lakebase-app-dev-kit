// E2E-layer PRESENCE guard. checkE2ECoverage only bites once an AC is tagged layer:"E2E",
// so a design lane that mis-classifies every client-facing AC as API/Infra ships a feature
// with ZERO E2E ACs that passes the coverage guard vacuously , exactly how the actor-less
// pick form shipped (the design lane flattened even a rewritten "operator submits the form
// in the browser" premise into a backend "the pick is saved" API AC). checkE2eLayerPresent
// closes it: a client-facing feature MUST carry >=1 E2E AC. It reads TWO signals so the
// mis-classification cannot dodge it , the architect's own renders_via boundary AND the
// architect-independent React-UI-track project signal. The gate wiring defers until every
// declared story is designed (the streaming design lane), then hard-blocks the spec gate.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkE2eLayerPresent } from "../../consort/orchestrator/validators/conformance/artifact-conformance";
import { e2eLayerPresentReason } from "../../consort/gates/gate-conformance-guard";

const REACT_BOUNDARY = JSON.stringify({
  feature_id: "F4-pick",
  service_backed: true,
  layers: [{ role: "boundary", module: "app/routes", renders_via: "react" }],
});
// A plain API boundary , the shape the mis-classification produces when it ALSO drops renders_via.
const API_BOUNDARY = JSON.stringify({
  feature_id: "F4-pick",
  service_backed: true,
  layers: [{ role: "boundary", module: "app/routes" }],
});

describe("checkE2eLayerPresent (the decision logic, both signals)", () => {
  it("renders_via boundary + no E2E AC => BLOCK (the actor-less-form shape)", () => {
    const r = checkE2eLayerPresent(REACT_BOUNDARY, { acLayers: ["API", "Infra"] });
    expect(r.ok).toBe(false);
    expect(r.violations?.join(" ")).toMatch(/layer:"E2E"/);
  });

  it("renders_via boundary + an E2E AC present => ok", () => {
    expect(checkE2eLayerPresent(REACT_BOUNDARY, { acLayers: ["API", "E2E"] }).ok).toBe(true);
  });

  it("no renders_via + not a React project => ok (a genuine API/CLI/Infra feature)", () => {
    expect(checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["API"], uiReact: false }).ok).toBe(true);
  });

  it("no renders_via BUT a React UI-track project exposing an API AC + no E2E => BLOCK (signal 2)", () => {
    // The mis-classification dropped renders_via too; the project signal still catches it.
    const r = checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["API", "Infra"], uiReact: true });
    expect(r.ok).toBe(false);
    expect(r.violations?.join(" ")).toMatch(/React UI-track/);
  });

  it("a React project with only Infra ACs (no endpoint the SPA calls) => ok (no false positive)", () => {
    expect(checkE2eLayerPresent(API_BOUNDARY, { acLayers: ["Infra"], uiReact: true }).ok).toBe(true);
  });

  it("malformed architecture => BLOCK (surface the parse error, do not pass vacuously)", () => {
    expect(checkE2eLayerPresent("{ not json", { acLayers: ["API"], uiReact: true }).ok).toBe(false);
  });
});

describe("e2eLayerPresentReason (gate wiring: streaming deferral + spec-gate block)", () => {
  const F = "F4-pick";
  let tmp: string;
  let consortDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "e2e-layer-"));
    consortDir = join(tmp, ".consort");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function projectConfig(clientFramework: "react" | "none"): void {
    const p = join(tmp, ".lakebase", "consort-config.json");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify({ project: { uiTrack: true, clientFramework } }));
  }
  function featureFile(rel: string, obj: unknown): void {
    const p = join(consortDir, "features", F, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  }
  function ac(story: string, id: string, layer: "API" | "E2E" | "Infra"): void {
    featureFile(join("stories", story, "acs", `${id}.json`), { id, layer, given: "g", when: "w", then: "t" });
  }

  it("all stories designed, React boundary, all API/Infra (zero E2E) => spec gate BLOCKS", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-save", "API");
    ac("S2-row", "AC2-row", "Infra");
    expect(e2eLayerPresentReason(consortDir, F)).not.toBeNull();
  });

  it("all stories designed with an E2E AC present => passes (null)", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-submit", "E2E");
    ac("S2-row", "AC2-row", "Infra");
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });

  it("a declared story not yet designed => DEFERS (null), never a premature block", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form", "S2-row"] });
    featureFile("architecture.json", JSON.parse(REACT_BOUNDARY));
    ac("S1-form", "AC1-save", "API"); // S2 has no acs/ yet , design incomplete
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });

  it("renders_via dropped but a React project with an API AC => BLOCKS via the project signal", () => {
    projectConfig("react");
    featureFile("feature-spec.json", { id: F, stories: ["S1-form"] });
    featureFile("architecture.json", JSON.parse(API_BOUNDARY)); // NO renders_via
    ac("S1-form", "AC1-save", "API");
    expect(e2eLayerPresentReason(consortDir, F)).not.toBeNull();
  });

  it("not a React project + no renders_via => passes (a genuine backend feature)", () => {
    projectConfig("none");
    featureFile("feature-spec.json", { id: F, stories: ["S1-endpoint"] });
    featureFile("architecture.json", JSON.parse(API_BOUNDARY));
    ac("S1-endpoint", "AC1-get", "API");
    expect(e2eLayerPresentReason(consortDir, F)).toBeNull();
  });
});
