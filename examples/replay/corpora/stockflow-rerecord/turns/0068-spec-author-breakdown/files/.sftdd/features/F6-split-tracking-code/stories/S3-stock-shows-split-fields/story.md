# S3-stock-shows-split-fields

**As a** warehouse team member
**I want to** see a stock record display `batch_number` and `serial_number` as distinct, separately addressable fields on the stock view wherever the combined tracking code used to be shown, including a clear "none yet" when a field is NULL
**So that** I can read and reference batch and serial on their own instead of decoding one opaque combined code.

Scope: the user-facing E2E (UI) story: the rendered SPA stock view exposes the split fields. Distinct from S1/S2, which are schema-only migrations.
