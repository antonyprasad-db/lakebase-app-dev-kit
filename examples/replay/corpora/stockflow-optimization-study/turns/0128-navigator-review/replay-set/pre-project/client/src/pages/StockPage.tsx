import { useStock } from "../hooks/useStock";
import type { StockRecord } from "../api/stock";

// Presentational row for the /stock list. Renders batch_number and serial_number
// with stable data-testid seams; substitutes "not tracked" for null values so the
// element is always present (no silent blank regions, per design-guide rule).
function StockRow({ record }: { record: StockRecord }) {
  return (
    <tr className="stock-table__row" data-testid="stock-table-row">
      <td className="stock-table__cell">{record.sku}</td>
      <td className="stock-table__cell">{record.location}</td>
      <td
        className="stock-table__cell stock-table__cell--quantity"
        data-testid="stock-table-quantity"
      >
        {record.quantity}
      </td>
      <td className="stock-table__cell" data-testid="batch-number">
        {record.batch_number ?? "not tracked"}
      </td>
      <td className="stock-table__cell" data-testid="serial-number">
        {record.serial_number ?? "not tracked"}
      </td>
    </tr>
  );
}

// /stock page: stock list with separate batch_number / serial_number columns (F6/S3).
// Every state (loading, error, empty, ok) is explicit — never a blank region.
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
        {stock.status === "ok" && stock.records.length === 0 && (
          <p className="stock-table__empty" data-testid="empty-state" role="status">
            No stock on hand
          </p>
        )}
        {stock.status === "ok" && stock.records.length > 0 && (
          <table className="stock-table" data-testid="stock-table">
            <thead className="stock-table__head">
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Location</th>
                <th scope="col" className="stock-table__cell--quantity">
                  Quantity
                </th>
                <th scope="col">Batch Number</th>
                <th scope="col">Serial Number</th>
              </tr>
            </thead>
            <tbody>
              {stock.records.map((rec) => (
                <StockRow key={`${rec.sku} ${rec.location}`} record={rec} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
