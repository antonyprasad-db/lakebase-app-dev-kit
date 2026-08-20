import { getJson } from "./client";

// The home stock table's read model. The api/ layer is the ONLY layer that
// issues fetch; hooks call this typed wrapper (NFR-F1-5).
export interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
}

export function fetchStock(): Promise<StockRecord[]> {
  return getJson<StockRecord[]>("/stock");
}
