// The home stock-by-location table (ia.md "Home"). Presentational: receives
// rows as props, never fetches (see hooks/useStockRecords.ts for that). The
// quantity column carries the design-guide seam , font_mono, tabular figures,
// right-aligned , via a stable data-testid PLUS class, never an inline style.

export interface StockRow {
  sku: string;
  location: string;
  quantity: number;
  batch_number?: string | null;
  serial_number?: string | null;
}

interface StockTableProps {
  rows: StockRow[];
  // Navigation is a routing concern owned by the page; this table stays
  // presentational and simply notifies which row was activated (S3
  // view-batch-and-serial: opening a row's detail view).
  onRowClick?: (row: StockRow) => void;
}

export function StockTable({ rows, onRowClick }: StockTableProps) {
  if (rows.length === 0) {
    return (
      <p className="stock-table__empty" data-testid="stock-empty-state">
        No stock at this location, receive an inbound shipment
      </p>
    );
  }

  return (
    <table className="stock-table" data-testid="stock-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Location</th>
          <th className="stock-table__quantity--right">Quantity</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.sku}::${row.location}`}
            data-testid="stock-row"
            className={onRowClick ? "stock-table__row--clickable" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <td>{row.sku}</td>
            <td>{row.location}</td>
            <td
              className="stock-table__quantity--right"
              data-testid="stock-quantity-cell"
            >
              {row.quantity}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
