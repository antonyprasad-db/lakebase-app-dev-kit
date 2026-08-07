import { getJson, postJson } from "./client";

export interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
}

export function fileStockRecord(payload: StockRecord): Promise<StockRecord> {
  return postJson<StockRecord>("/api/stock", payload);
}

export function fetchStockRecord(sku: string, location: string): Promise<StockRecord> {
  return getJson<StockRecord>(`/api/stock/${encodeURIComponent(sku)}/${encodeURIComponent(location)}`);
}

export interface StockLocationRecord {
  sku: string;
  location: string;
  quantity: number;
}

export function fetchStockByLocation(location: string): Promise<StockLocationRecord[]> {
  return getJson<StockLocationRecord[]>(`/api/stock/location/${encodeURIComponent(location)}`);
}

export interface SkuDetailEntry {
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
  par_level: number | null;
}

export function fetchSkuDetail(sku: string): Promise<SkuDetailEntry[]> {
  return getJson<SkuDetailEntry[]>(`/api/stock/sku/${encodeURIComponent(sku)}`);
}
