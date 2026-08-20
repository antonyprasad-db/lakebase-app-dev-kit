import { useEffect, useState } from "react";
import { getStock, type StockRecord } from "../api/stock";

export type StockState =
  | { status: "loading" }
  | { status: "ok"; records: StockRecord[] }
  | { status: "error"; message: string };

// Holds the stock-listing fetch + UI state; calls the api/ layer, never fetches
// directly. The page renders each state explicitly (no silent blank region).
export function useStock(): StockState {
  const [state, setState] = useState<StockState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getStock()
      .then((records) => {
        if (!cancelled) setState({ status: "ok", records });
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
  }, []);

  return state;
}
