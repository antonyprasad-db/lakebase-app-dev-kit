#!/usr/bin/env bash
# Reproducibly assemble the driver-green S2 setup bundle (the S2-drop-combined-code MIGRATION turn ,
# the run-17 thrasher, and a judgeable supersession/regression pin) from the stockflow-full corpus.
# Idempotent: wipes + rebuilds the bundle each run. Provenance is auditable here, not hand-copied.
#
# Sources (all committed corpus):
#   code-assets ← recorded-build .../S2-drop-combined-code/turns/001-navigator/code (post-RED tree: the
#                 failing test + still-present inventory_code; NOT 002-driver, which is already green)
#   design      ← recorded-artifacts F6 {architecture,db-design,test-list}.json + S2 acs/AC1-column-dropped
#                 + conventions.json reused from the S3 bundle (same F6 project layout)
#   next-step judge reference ← 003-navigator-assess-AC1-column-dropped/regression-assessment.json (the
#                 same-step evaluation the corpus recorded: a REGRESSION determination)
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

CORPUS=examples/replay/corpora/stockflow-full
RB=$CORPUS/recorded-build/features/F6-split-tracking-code/stories/S2-drop-combined-code
RA=$CORPUS/recorded-artifacts/features/F6-split-tracking-code
S3=tests/integration/live/driver-green-setup
DEST=tests/integration/live/driver-green-setup-s2
REF=consort/evaluation/reference-assets/stockflow/next-step/driver-green-s2
# The recorded evaluation OF THIS STEP: the navigator turn that immediately FOLLOWED the S2 driver-green
# (003-navigator-assess). Its determination is a REGRESSION , the drop removed inventory_code but the code
# still references it (contract-incompleteness), the same conclusion a live candidate's navigator reaches.
# The discriminator compares a candidate's determination to THIS same-step evaluation: reproduce the
# regression => SAME; resolve it clean => BETTER; a worse/divergent determination => WORSE. (NOT 019, a
# LATER flag-superseded turn whose superseded-shift is a different step , comparing a correct regression
# assess to it read "worse" for every candidate. 003's green-verify was infra-degenerate at record time ,
# "no deploy target" , but its regression determination is sound and IS how the corpus evaluated the step.)
SUP=$RB/turns/003-navigator-assess-AC1-column-dropped/tdd/cycles/F6-split-tracking-code/S2-drop-combined-code/AC1-column-dropped

echo "[curate-s2] wiping + rebuilding $DEST + $REF"
rm -rf "$DEST" "$REF"
mkdir -p "$DEST/code-assets" "$DEST/design/architecture" "$DEST/design/stories/S2-drop-combined-code/acs" "$REF"

# 1. code-assets: the POST-RED tree = the RED turn's snapshot (001-navigator), which has the failing
#    test AND still-present inventory_code (NOT the 002-DRIVER output, which is already green => vacuous
#    turn => DQ "honest-GREEN stamped green"). Exclude .tmp/ scratch.
cp -R "$RB/turns/001-navigator/code/." "$DEST/code-assets/"
rm -rf "$DEST/code-assets/.tmp"

# 2. design: the feature design artifacts + the target AC + the layout (conventions from the S3 bundle).
cp "$RA/architecture.json" "$RA/db-design.json" "$RA/test-list.json" "$DEST/design/"
cp "$S3/design/architecture/conventions.json" "$DEST/design/architecture/conventions.json"
cp "$RA/stories/S2-drop-combined-code/acs/AC1-column-dropped.json" "$DEST/design/stories/S2-drop-combined-code/acs/"

# 3. next-step judge reference: the recorded SAME-STEP evaluation , 003-navigator-assess's REGRESSION
#    determination (regression-assessment.json => classification "regression"). ONLY this file goes in REF
#    (no superseded-tests.json), so parseNavigatorAssessMarker classifies the reference as regression:
#    a candidate that reproduces the regression scores SAME, a clean resolution BETTER, a divergence WORSE.
#    SCHEMA TRANSLATION: corpus 003 predates the fixDirective rename (it used "fix"); the parser reads
#    `fixDirective` to classify a regression (else "insufficient"). Rename the key so the recorded
#    determination parses as the regression it IS , meaning preserved, only the field name modernized.
python3 - "$SUP/regression-assessment.json" "$REF/regression-assessment.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
if "fix" in d and "fixDirective" not in d:
    d["fixDirective"] = d.pop("fix")
with open(dst, "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
PY

# 4. run-config: same shape as the S3 bundle, story = S2-drop-combined-code.
sed 's/S3-stock-shows-split-fields/S2-drop-combined-code/g' "$S3/driver-green.run.json" > "$DEST/driver-green.run.json"

echo "[curate-s2] done. bundle=$DEST reference=$REF"
echo "[curate-s2] verify:"; find "$DEST" -maxdepth 3 -type f | sort | sed 's/^/  /'
echo "  reference:"; ls "$REF" | sed 's/^/    /'
