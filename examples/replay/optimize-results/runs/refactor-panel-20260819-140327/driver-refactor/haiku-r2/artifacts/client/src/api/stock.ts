import { getJson } from "./client";

export interface StockItem {
  sku: string;
  location: string;
  quantity: number;
}

export function getStock(): Promise<StockItem[]> {
  return getJson<StockItem[]>("/api/stock");
}
