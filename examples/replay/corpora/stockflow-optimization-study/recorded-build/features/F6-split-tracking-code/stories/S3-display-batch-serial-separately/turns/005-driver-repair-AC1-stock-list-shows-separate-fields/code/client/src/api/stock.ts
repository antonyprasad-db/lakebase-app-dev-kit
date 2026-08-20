import { getJson } from "./client";

// A stock record as the JSON boundary (GET /api/stock) returns it.
export interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
}

export function getStock(): Promise<StockRecord[]> {
  return getJson<StockRecord[]>("/api/stock");
}

// One location's detail for a SKU, as GET /api/stock/<sku> returns it. par_level
// is optional/nullable: an untracked par level is null/omitted, never a string.
export interface SkuLocationRow {
  sku: string;
  location: string;
  quantity: number;
  tracking_code?: string | null;
  par_level?: number | null;
}

export function getSkuDetail(sku: string): Promise<SkuLocationRow[]> {
  return getJson<SkuLocationRow[]>(`/api/stock/${encodeURIComponent(sku)}`);
}
