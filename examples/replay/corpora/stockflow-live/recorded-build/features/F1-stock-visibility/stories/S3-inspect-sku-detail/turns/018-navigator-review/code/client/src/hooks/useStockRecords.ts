import { useEffect, useState } from "react";
import { getStockRecords, type StockRecordDto } from "../api/stockRecords";

export type StockRecordsState =
  | { status: "loading" }
  | { status: "ok"; records: StockRecordDto[]; message?: string | null }
  | { status: "error"; message: string };

// Hooks hold data-fetching + UI state; they call the api/ layer and never
// fetch directly. Components receive the resulting state as props.
export function useStockRecords(location?: string): StockRecordsState {
  const [state, setState] = useState<StockRecordsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getStockRecords(location)
      .then((body) => {
        if (!cancelled) {
          setState({ status: "ok", records: body.records, message: body.message });
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
  }, [location]);

  return state;
}
