// Kit adoptLakebaseProject: brownfield adoption with Consort lay-down injected.
//
// The base adoption lives in @databricks-solutions/lakebase-scm-utils and is
// Consort-agnostic. This kit wrapper injects the optional `.consort/` adoption hook
// so `enableConsort` adoptions drop the Consort scaffold. assertAdoptionPreflight
// and the test fixture are pure substrate; they are re-exported unchanged.

import {
  adoptLakebaseProject as baseAdoptLakebaseProject,
  assertAdoptionPreflight,
  _testMakeBrownfieldFixture,
  type AdoptLakebaseProjectArgs,
  type AdoptLakebaseProjectResult,
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { adoptConsortHook } from "../../consort/setup/project-consort-setup.js";

export { assertAdoptionPreflight, _testMakeBrownfieldFixture };
export type { AdoptLakebaseProjectArgs, AdoptLakebaseProjectResult };

export function adoptLakebaseProject(
  args: AdoptLakebaseProjectArgs,
): Promise<AdoptLakebaseProjectResult> {
  return baseAdoptLakebaseProject({
    ...args,
    adoptConsortHook: args.adoptConsortHook ?? adoptConsortHook,
  });
}
