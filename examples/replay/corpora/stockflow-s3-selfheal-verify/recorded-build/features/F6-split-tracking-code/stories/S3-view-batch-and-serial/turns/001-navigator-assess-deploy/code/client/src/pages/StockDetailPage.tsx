import { useParams } from "react-router-dom";
import { useStockRecordDetail } from "../hooks/useStockRecordDetail";
import { StockDetail } from "./StockDetail";

// Route-level page: wires useStockRecordDetail to the URL's sku/location
// params and renders every state explicitly (loading, error, ok), per the
// design guide's no-silent-states rule. StockDetail itself stays
// presentational (see StockDetail.tsx).
export function StockDetailPage() {
  const { sku = "", location = "" } = useParams<{ sku: string; location: string }>();
  const detail = useStockRecordDetail(sku, location);

  return (
    <main className="page">
      {detail.status === "loading" && <p>Loading stock record...</p>}
      {detail.status === "error" && (
        <p data-testid="stock-detail-error">Stock record unavailable: {detail.message}</p>
      )}
      {detail.status === "ok" && <StockDetail record={detail.record} />}
    </main>
  );
}
