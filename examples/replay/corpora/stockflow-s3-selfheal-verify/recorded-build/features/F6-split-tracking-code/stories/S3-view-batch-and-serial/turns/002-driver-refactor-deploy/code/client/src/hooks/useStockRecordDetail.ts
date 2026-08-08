import { useEffect, useState } from "react";
import { getStockRecord, type StockRecordDto } from "../api/stockRecords";

export type StockRecordDetailState =
  | { status: "loading" }
  | { status: "ok"; record: StockRecordDto }
  | { status: "error"; message: string };

// Hooks hold data-fetching + UI state; they call the api/ layer and never
// fetch directly. Pages receive the resulting state as props (StockDetail
// itself stays presentational, receiving the record only).
export function useStockRecordDetail(sku: string, location: string): StockRecordDetailState {
  const [state, setState] = useState<StockRecordDetailState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getStockRecord(sku, location)
      .then((record) => {
        if (!cancelled) {
          setState({ status: "ok", record });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "unknown error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sku, location]);

  return state;
}
