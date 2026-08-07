import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchStockRecord, type StockRecord } from "../api/stock";

export function RetrieveStockPage() {
  const { pathname } = useLocation();
  // Expect path of the form /stock/<sku>/<location>
  const segments = pathname.split("/").filter(Boolean);
  const sku = segments[1] ?? "";
  const location = segments[2] ?? "";

  const [record, setRecord] = useState<StockRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStockRecord(sku, location)
      .then(setRecord)
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
          <dd data-testid="stock-batch-number">{record.batch_number ?? "none"}</dd>
          <dt>Serial Number</dt>
          <dd data-testid="stock-serial-number">{record.serial_number ?? "none"}</dd>
        </dl>
      )}
    </main>
  );
}
