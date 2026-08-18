#!/usr/bin/env bash
# Reproducibly assemble the driver-green S2 setup bundle (the S2-drop-combined-code MIGRATION turn ,
# the run-17 thrasher, and a judgeable supersession/regression pin) from the stockflow-full corpus.
# Idempotent: wipes + rebuilds the bundle each run. Provenance is auditable here, not hand-copied.
#
# Sources (all committed corpus):
#   code-assets ← recorded-build .../S2-drop-combined-code/turns/002-driver/code (post-RED tree)
#   design      ← recorded-artifacts F6 {architecture,db-design,test-list}.json + S2 acs/AC1-column-dropped
#                 + conventions.json reused from the S3 bundle (same F6 project layout)
#   next-step judge reference ← 003-navigator-assess-AC1-column-dropped {green-failure,regression-assessment}.json
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

CORPUS=examples/replay/corpora/stockflow-full
RB=$CORPUS/recorded-build/features/F6-split-tracking-code/stories/S2-drop-combined-code
RA=$CORPUS/recorded-artifacts/features/F6-split-tracking-code
S3=tests/integration/live/driver-green-setup
DEST=tests/integration/live/driver-green-setup-s2
REF=consort/evaluation/reference-assets/stockflow/next-step/driver-green-s2
# The recorded SUPERSESSION determination for AC1-column-dropped (dropping inventory_code supersedes the
# inventory_code tests). superseded-tests.json parses to classification "superseded-shift" , the SAME
# contract S3 uses, and the semantically-correct next-step for a drop-column migration. (The earlier
# 003-assess had a stale regression-assessment shape + a degenerate "no deploy target" green-failure.)
SUP=$RB/turns/019-navigator/tdd/cycles/F6-split-tracking-code/S2-drop-combined-code/AC1-column-dropped

echo "[curate-s2] wiping + rebuilding $DEST + $REF"
rm -rf "$DEST" "$REF"
mkdir -p "$DEST/code-assets" "$DEST/design/architecture" "$DEST/design/stories/S2-drop-combined-code/acs" "$REF"

# 1. code-assets: the post-RED tree (exclude .tmp/ scratch).
cp -R "$RB/turns/002-driver/code/." "$DEST/code-assets/"
rm -rf "$DEST/code-assets/.tmp"

# 2. design: the feature design artifacts + the target AC + the layout (conventions from the S3 bundle).
cp "$RA/architecture.json" "$RA/db-design.json" "$RA/test-list.json" "$DEST/design/"
cp "$S3/design/architecture/conventions.json" "$DEST/design/architecture/conventions.json"
cp "$RA/stories/S2-drop-combined-code/acs/AC1-column-dropped.json" "$DEST/design/stories/S2-drop-combined-code/acs/"

# 3. next-step judge reference: the recorded SUPERSESSION determination (superseded-tests.json =>
#    classification "superseded-shift", scored by the assess deltaJudge , same contract as S3).
cp "$SUP/superseded-tests.json" "$REF/"

# 4. run-config: same shape as the S3 bundle, story = S2-drop-combined-code.
sed 's/S3-stock-shows-split-fields/S2-drop-combined-code/g' "$S3/driver-green.run.json" > "$DEST/driver-green.run.json"

echo "[curate-s2] done. bundle=$DEST reference=$REF"
echo "[curate-s2] verify:"; find "$DEST" -maxdepth 3 -type f | sort | sed 's/^/  /'
echo "  reference:"; ls "$REF" | sed 's/^/    /'
