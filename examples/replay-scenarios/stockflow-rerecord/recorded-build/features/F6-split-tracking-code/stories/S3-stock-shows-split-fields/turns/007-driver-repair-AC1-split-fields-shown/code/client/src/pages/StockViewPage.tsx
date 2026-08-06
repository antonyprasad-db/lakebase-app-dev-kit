import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchStockRecord } from "../api/stock";

interface SplitStockRecord {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
}

export function StockViewPage() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  const sku = segments[1] ?? "";
  const location = segments[2] ?? "";

  const [record, setRecord] = useState<SplitStockRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStockRecord(sku, location)
      .then((r) => setRecord(r as unknown as SplitStockRecord))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [sku, location]);

  return (
    <main className="page">
      <h1>Stock Record</h1>
      {error && <p role="alert" data-testid="fetch-error">{error}</p>}
      {!record && !error && <p>Loading...</p>}
      {record && (
        <dl>
          <dt>SKU</dt>
          <dd>{record.sku}</dd>
          <dt>Location</dt>
          <dd>{record.location}</dd>
          <dt>Quantity</dt>
          <dd data-testid="stock-quantity">{record.quantity}</dd>
          <dt>Batch Number</dt>
          <dd data-testid="stock-batch-number">{record.batch_number ?? "none yet"}</dd>
          <dt>Serial Number</dt>
          <dd data-testid="stock-serial-number">{record.serial_number ?? "none yet"}</dd>
        </dl>
      )}
    </main>
  );
}
