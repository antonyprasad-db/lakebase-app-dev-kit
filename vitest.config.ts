import { defineConfig } from "vitest/config";

// Tests in templates/** are scaffolded artifacts that ship with USER
// projects (e.g. templates/project/nodejs/tests/app.test.js requires
// supertest and a sibling src/index.js – neither exists in this repo).
// They're meant to run AFTER scaffold, not as part of our test suite.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.js"],
    // The driver-green setup bundle's code-assets (green + *-seed) are SCAFFOLD FIXTURES: a recorded app
    // tree with its own client tests, meant to run AFTER scaffold (against a real project), NOT as part of
    // our suite , same rationale as templates/**. Exclude every seed code-asset tree so their *.test.* are
    // never collected here (was implicitly tolerated for the green code-assets; explicit now the *-seed
    // trees add react-importing client tests).
    exclude: ["templates/**", "node_modules/**", "dist/**", "tests/integration/live/driver-green-setup/**/code-assets/**"],
    // The git-fixture tests (git-*, github-*) are hermetic but spawn CHAINS
    // of real git subprocesses against tempdir bare repos (init/clone/push/
    // fetch). When the pre-push hook runs the FULL suite with parallel
    // workers, those chains contend for CPU/IO and a single test can cross a
    // tight timeout, flaking the gate and forcing push retries. 5s then 10s
    // both still flaked; 30s gives 3x headroom so a contended run is reliable
    // without meaningfully slowing genuine-hang detection. Per-test overrides
    // for the truly long ones (migrate-live, deploy-end-to-end, etc.) stay in
    // place via their `it("...", fn, 180_000)` annotations.
    testTimeout: 30_000,
  },
});
