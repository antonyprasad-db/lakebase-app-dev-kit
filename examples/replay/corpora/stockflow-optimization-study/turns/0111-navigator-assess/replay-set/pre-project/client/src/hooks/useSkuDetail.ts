import { useEffect, useState } from "react";
import { getSkuDetail, type SkuLocationRow } from "../api/stock";

export type SkuDetailState =
  | { status: "loading" }
  | { status: "ok"; rows: SkuLocationRow[] }
  | { status: "error"; message: string };

// Holds the SKU-detail fetch + UI state; calls the api/ layer, never fetches
// directly. The page renders each state explicitly (no silent blank region).
export function useSkuDetail(sku: string): SkuDetailState {
  const [state, setState] = useState<SkuDetailState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getSkuDetail(sku)
      .then((rows) => {
        if (!cancelled) setState({ status: "ok", rows });
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
  }, [sku]);

  return state;
}
