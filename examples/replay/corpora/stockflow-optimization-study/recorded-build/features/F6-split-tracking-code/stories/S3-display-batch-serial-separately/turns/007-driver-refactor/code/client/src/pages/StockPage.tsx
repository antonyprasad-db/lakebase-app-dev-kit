import { useStock } from "../hooks/useStock";
import { StockTable } from "../components/StockTable";

// /stock page: stock list with separate batch_number / serial_number columns (F6/S3).
// Reuses the shared StockTable row component (showTracking) so there is a single
// presentational implementation of the stock-row shape. Every state (loading,
// error, empty, ok) is explicit — never a blank region.
export function StockPage() {
  const stock = useStock();

  return (
    <main className="page" data-testid="stock-page">
      <h1>Stock List</h1>

      <section className="card" aria-label="Stock records">
        {stock.status === "loading" && (
          <p className="stock-table__status" role="status">
            Loading stock...
          </p>
        )}
        {stock.status === "error" && (
          <p className="stock-table__status" role="alert">
            Could not load stock: {stock.message}
          </p>
        )}
        {stock.status === "ok" && (
          <StockTable
            records={stock.records}
            showTracking
            emptyMessage="No stock on hand"
          />
        )}
      </section>
    </main>
  );
}
