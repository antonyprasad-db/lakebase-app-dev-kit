import { getJson } from "./client";

// The backend's GET /api/stock-records boundary (app/routes/stock_records.py).
// The api/ layer is the ONLY layer that issues fetch; hooks call this typed
// wrapper.
export interface StockRecordDto {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
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

// The backend's GET /api/stock-records/{sku}/{location} boundary; used by the
// stock detail view (S3-view-batch-and-serial).
export function getStockRecord(sku: string, location: string): Promise<StockRecordDto> {
  return getJson<StockRecordDto>(
    `/api/stock-records/${encodeURIComponent(sku)}/${encodeURIComponent(location)}`
  );
}
