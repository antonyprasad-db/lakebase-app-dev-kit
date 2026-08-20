import { Link } from "react-router-dom";
import type { StockRecord } from "../api/stock";

// Presentational stock table (NFR-F1-7). Renders one row per record with the
// quantity column right-aligned via the design-guide stock-table__cell--quantity
// seam; shows an explicit empty-state when there are no records (never blank).
//
// The single shared row shape for every stock list (DRY/SRP): HomePage renders
// the base SKU/Location/Quantity columns, and the /stock page opts into the
// batch_number / serial_number columns via showTracking. Null tracking codes
// render an explicit "not tracked" indicator so the cell is never blank
// (NFR-F6-8).
export function StockTable({
  records,
  showTracking = false,
  emptyMessage = "No stock at this location",
}: {
  records: StockRecord[];
  showTracking?: boolean;
  emptyMessage?: string;
}) {
  if (records.length === 0) {
    return (
      <p className="stock-table__empty" data-testid="empty-state" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <table className="stock-table" data-testid="stock-table">
      <thead className="stock-table__head">
        <tr>
          <th scope="col">SKU</th>
          <th scope="col">Location</th>
          <th scope="col" className="stock-table__cell--quantity">
            Quantity
          </th>
          {showTracking && <th scope="col">Batch Number</th>}
          {showTracking && <th scope="col">Serial Number</th>}
        </tr>
      </thead>
      <tbody>
        {records.map((rec) => (
          <tr
            key={`${rec.sku} ${rec.location}`}
            className="stock-table__row"
            data-testid="stock-table-row"
          >
            <td className="stock-table__cell">
              <Link className="stock-table__sku-link" to={`/sku/${rec.sku}`}>
                {rec.sku}
              </Link>
            </td>
            <td className="stock-table__cell">{rec.location}</td>
            <td
              className="stock-table__cell stock-table__cell--quantity"
              data-testid="stock-table-quantity"
            >
              {rec.quantity}
            </td>
            {showTracking && (
              <td className="stock-table__cell" data-testid="batch-number">
                {rec.batch_number ?? "not tracked"}
              </td>
            )}
            {showTracking && (
              <td className="stock-table__cell" data-testid="serial-number">
                {rec.serial_number ?? "not tracked"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
