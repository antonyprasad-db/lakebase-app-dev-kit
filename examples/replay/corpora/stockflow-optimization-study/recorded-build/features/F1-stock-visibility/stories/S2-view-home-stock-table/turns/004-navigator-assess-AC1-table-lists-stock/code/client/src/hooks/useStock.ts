import { useEffect, useState } from "react";
import { fetchStock, type StockRecord } from "../api/stock";

export type StockState =
  | { status: "loading" }
  | { status: "ok"; records: StockRecord[] }
  | { status: "error"; message: string };

// Hooks hold data-fetching + UI state; they call the api/ layer and never fetch
// directly. Components receive the resulting state.
export function useStock(): StockState {
  const [state, setState] = useState<StockState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchStock()
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
