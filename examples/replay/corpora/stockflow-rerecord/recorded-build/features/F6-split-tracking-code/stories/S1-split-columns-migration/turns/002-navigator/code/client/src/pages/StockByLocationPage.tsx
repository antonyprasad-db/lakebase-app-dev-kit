import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchStockByLocation, StockLocationRecord } from "../api/stock";

export function StockByLocationPage() {
  const { pathname } = useLocation();
  // Expect path of the form /location/<location>
  const segments = pathname.split("/").filter(Boolean);
  const location = segments[1] ?? "";

  const [records, setRecords] = useState<StockLocationRecord[] | null>(null);

  useEffect(() => {
    fetchStockByLocation(location).then(setRecords);
  }, [location]);

  if (records === null) {
    return null;
  }

  if (records.length === 0) {
    return (
      <div data-testid="empty-state">No stock at this location</div>
    );
  }

  return (
    <table data-testid="stock-table">
      <tbody>
        {records.map((r) => (
          <tr key={r.sku} data-testid={`stock-row-${r.sku}`}>
            <td>{r.sku}</td>
            <td>{r.location}</td>
            <td data-testid={`qty-cell-${r.sku}`} className="qty-right">{r.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
