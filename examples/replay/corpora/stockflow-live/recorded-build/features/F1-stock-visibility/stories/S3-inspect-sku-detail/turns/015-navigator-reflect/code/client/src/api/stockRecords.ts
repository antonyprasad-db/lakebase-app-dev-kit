import { getJson } from "./client";

// The backend's GET /api/stock-records boundary (app/routes/stock_records.py).
// The api/ layer is the ONLY layer that issues fetch; hooks call this typed
// wrapper.
export interface StockRecordDto {
  sku: string;
  location: string;
  quantity: number;
  inventory_code: string;
}

export interface StockRecordsResponse {
  records: StockRecordDto[];
  message?: string | null;
}

export function getStockRecords(location?: string): Promise<StockRecordsResponse> {
  const path = location
    ? `/api/stock-records?location=${encodeURIComponent(location)}`
    : "/api/stock-records";
  return getJson<StockRecordsResponse>(path);
}
