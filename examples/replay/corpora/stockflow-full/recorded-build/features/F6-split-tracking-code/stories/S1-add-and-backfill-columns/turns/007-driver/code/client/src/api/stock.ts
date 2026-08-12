import { getJson } from "./client";

export interface StockItem {
  sku: string;
  location: string;
  quantity: number;
}

export interface StockDetailRow {
  sku: string;
  location: string;
  quantity: number;
  inventory_code?: string | null;
  par_level?: number | null;
}

export function getStock(): Promise<StockItem[]> {
  return getJson<StockItem[]>("/api/stock");
}

export function getSkuDetail(sku: string): Promise<StockDetailRow[]> {
  return getJson<StockDetailRow[]>(`/api/stock/${sku}`);
}
