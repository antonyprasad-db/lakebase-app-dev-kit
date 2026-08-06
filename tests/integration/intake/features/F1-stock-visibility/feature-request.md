---
author: Feature Requester
feature_id: F1-stock-visibility
---

# Feature request: Record and view stock by SKU and location

## What I'm asking for

The V1 visibility slice of StockFlow: the simplest thing that lets a
warehouse team **record stock and see what is on the shelves at one
warehouse**. A warehouse operator on a floor tablet should be able to
file a stock record, then read the whole-warehouse picture on a home
table and drill into a single SKU's stock across its locations.

## Why now

The team has outgrown the shared spreadsheet. Before we can adjust
levels, record inbound receipts, or record outbound picks in later
features, we need the foundational record , what SKU is held, in what
quantity, at which location , and the two ways the team reads it back:
the by-location overview and the per-SKU detail. Everything downstream
builds on this record and these views.

## Scope (what V1 must do)

- File a stock record for one SKU at one location (SKU, location,
  quantity, and the single tracking code that encodes location, batch,
  and serial together), and retrieve it later. Filing the same
  (SKU, location) pair again updates the existing record in place , one
  record per pair, no duplicates.
- Show a home table of stock **by location**: one row per record, with
  SKU, location, and a right-aligned quantity, calm and scannable, so
  the team reads at a glance what is on the shelves across locations.
- Open a **SKU detail view** for one SKU showing its stock across all
  the locations that hold it, including its tracking code, so an
  operator can inspect one SKU in depth rather than only scan the
  whole-warehouse overview.
- Hold stock for the same SKU at more than one location within the one
  warehouse (a SKU+location pair is the unit of record).

## Out of scope for this feature

- Adjusting a stock level in place, and recording inbound receipts or
  outbound picks (separate later features that build on this record).
- Multi-warehouse operation (V1 is a single warehouse).
- Splitting the tracking code into separate location / batch / serial
  fields (the team accepts the combined code for now; a later iteration
  revisits it).

## How I'll know it's done

A warehouse operator can file a real stock record on the tablet, see it
on the by-location home table, and open the SKU detail view to inspect
that SKU across its locations , against working software, not a stub.
