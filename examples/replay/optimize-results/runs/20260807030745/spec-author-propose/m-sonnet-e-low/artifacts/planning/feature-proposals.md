# StockFlow – Sprint 1 Candidate Feature Proposals

**Date:** 2026-08-07
**Author:** Spec Author (planning mode)
**Purpose:** Input for the Product Owner to commit a sprint backlog. These are candidates only; the PO selects and prioritises.

---

## F1 – Initial Domain Model & Stock Record Management

**One-line ask:** Set up the foundational data model and expose the ability to file, retrieve, and adjust the stock level of one SKU at one location.

**Scope summary:**
- SQLAlchemy models for `StockRecord` (SKU, location, quantity, tracking code, timestamps).
- Alembic migration to create the table.
- Repository + service layers for create, read-by-`(sku, location)`, and quantity adjustment.
- REST routes: `POST /stock`, `GET /stock/{sku}/{location}`, `PATCH /stock/{sku}/{location}/adjust`.
- Unique-key enforcement: `(sku, location)` collision resolved at write time (upsert or explicit rejection per NFR R3).
- Stock level floor at zero (NFR R2): adjustment that would go negative is rejected with a clear validation message.
- Architectural fitness tests for server-side layer rules.

**Rationale:** Every other V1 capability (receipts, picks, UI) depends on this record existing. Nothing is demonstrable without it. Directly serves the PO's first listed V1 goal and NFRs R2, R3.

**NFRs served:** R1 (migration), R2 (floor), R3 (unique key), R4 (integration tests against branch).

**UI track note:** No end-user UI story in this feature — it is pure API + domain foundation. The PO may choose to couple a minimal stock-list page (see F2) so the first sprint is demonstrable in a browser.

**Priority:** Must-have (blocker for all other features).

---

## F2 – Stock Inventory UI (List & Detail)

**One-line ask:** A warehouse operator can open the SPA, see all stock records in a list, and tap into a detail view for a single `(sku, location)` record.

**Scope summary:**
- React SPA shell: Vite + React Router skeleton, navbar (64 px, navy), warm background, DM Sans loaded.
- Stock list page (`/`): fetches `GET /stock`, renders each record as a row (SKU, location, quantity, tracking code); empty-state message when no records exist.
- Stock detail page (`/stock/:sku/:location`): fetches `GET /stock/{sku}/{location}`, shows all fields; "not tracked" placeholder for optional fields (par level, batch, serial).
- Client architecture layers (`api/`, `hooks/`, `components/`, `pages/`) wired correctly; client architectural fitness tests.
- Vitest component + hook tests; Playwright E2E test for the happy-path list → detail flow.

**Rationale:** Makes the domain model from F1 demonstrable to the PO in a real browser on a tablet, fulfilling the "working software I can actually use" contract. Needed before sign-off. Serves NFR R5 (SPA, no full-page reloads) and the Databricks design guidelines.

**NFRs served:** R5 (SPA shell, client-side routing), R4 (Playwright E2E against branch).

**UI track note:** **Needs an E2E (UI) story.** The Playwright E2E layer must be scaffolded here because every subsequent UI feature builds on it.

**Priority:** Must-have for sprint demo (depends on F1).

---

## F3 – Inbound Receipt Recording

**One-line ask:** A warehouse operator can record that a known supplier delivered a known quantity of a SKU, and the stock level at a chosen location goes up.

**Scope summary:**
- `Receipt` model (supplier, SKU, location, quantity, timestamp, actor); Alembic migration.
- Service logic: create receipt → adjust stock upward at the target location (or create the record if none exists); transactional.
- REST route: `POST /receipts`.
- UI: receipt form page (`/receipts/new`) — SKU, location, supplier, quantity fields with visible labels and inline validation; on success, the stock-list row updates in place (optimistic update per NFR R5) and a confirmation is shown.
- Playwright E2E for the receipt → stock-level-increase flow.

**Rationale:** Directly maps to the PO's V1 goal "Record inbound receipts: a known supplier delivers a known quantity, and stock goes up." Depends on F1 (stock record) and F2 (SPA shell + list page for in-place update).

**NFRs served:** R1 (receipt timestamp unmodifiable), R2 (quantity always increases, no overcommit risk here), R4, R5 (optimistic update).

**UI track note:** **Needs an E2E (UI) story** for the receipt form → in-place stock row update.

**Priority:** High (core V1 workflow; depends on F1, F2).

---

## F4 – Outbound Pick Recording

**One-line ask:** A warehouse operator can record that a customer order drew stock down at a location; the system rejects the pick if it would overcommit.

**Scope summary:**
- `Pick` model (order reference, SKU, location, quantity, timestamp, actor); Alembic migration.
- Service logic: verify available quantity ≥ requested; if so, reduce stock atomically; if not, reject with a clear message naming the shortfall.
- REST route: `POST /picks`.
- UI: pick form page (`/picks/new`) — SKU, location, order reference, quantity; inline error when overcommit is attempted; on success, stock row updates in place.
- Playwright E2E for pick-success and pick-overcommit-rejected flows.

**Rationale:** Directly maps to the PO's V1 goal "Record outbound picks … with the system refusing to overcommit." Depends on F1, F2. Together with F3 this completes the core V1 receive → hold → pick loop.

**NFRs served:** R2 (no overcommit, no stored negative), R1 (pick timestamp), R4, R5.

**UI track note:** **Needs an E2E (UI) story** for the overcommit-rejection path (the most safety-critical observable behavior).

**Priority:** High (completes V1 loop; depends on F1, F2, and ideally F3 for realistic demo data).

---

## Recommended sprint scope

For a single coherent, demonstrable sprint the PO should consider **F1 + F2** as the minimum (foundation + visible UI) and optionally add **F3** if capacity allows, leaving F4 for sprint 2 once F3 is in real use. All four together are the full V1 loop but may exceed one sprint's bandwidth; the PO decides.
