import { getJson } from "./client";

// A stock record as the JSON boundary (GET /api/stock) returns it.
export interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
}

export function getStock(): Promise<StockRecord[]> {
  return getJson<StockRecord[]>("/api/stock");
}
