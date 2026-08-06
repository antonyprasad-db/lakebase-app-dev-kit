---
author: Feature Requester
feature_id: F1-stock-visibility
---

# Feature request: Record and view stock by SKU and location

## What I'm asking for

The V1 visibility slice of StockFlow: the simplest thing that lets a
warehouse team **see and adjust stock at one warehouse**. A warehouse
operator on a floor tablet should be able to file a stock record, look
it up, and adjust its level, and see the row move in place.

## Why now

The team has outgrown the shared spreadsheet. Before we can record
inbound receipts or outbound picks in later features, we need the
foundational record: what SKU is held, in what quantity, at which
location. Everything downstream reads and writes against that record.

## Scope (what V1 must do)

- File a stock record for one SKU at one location (SKU, location,
  quantity, and the single tracking code that encodes location, batch,
  and serial together).
- Retrieve the current stock level for a SKU at a location.
- Adjust the level of an existing record up or down, and never let an
  adjustment drive the recorded quantity below zero.
- Hold stock for the same SKU at more than one location within the one
  warehouse (a SKU+location pair is the unit of record).

## Out of scope for this feature

- Inbound receipts and outbound picks (separate later features; they
  build on this record).
- Multi-warehouse operation (V1 is a single warehouse).
- Splitting the tracking code into separate location / batch / serial
  fields (the team accepts the combined code for now; a later iteration
  revisits it).

## How I'll know it's done

A warehouse operator can file a real stock record on the tablet, see it
listed, adjust its quantity, and watch the stock row update in place ,
against working software, not a stub.
