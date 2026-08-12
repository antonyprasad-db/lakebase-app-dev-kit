import { useEffect, useState } from "react";
import { getStock, type StockItem } from "../api/stock";

export type StockListState =
  | { status: "loading" }
  | { status: "ok"; items: StockItem[] }
  | { status: "error"; message: string };

export function useStockList(): StockListState {
  const [state, setState] = useState<StockListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getStock()
      .then((items) => {
        if (!cancelled) setState({ status: "ok", items });
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
