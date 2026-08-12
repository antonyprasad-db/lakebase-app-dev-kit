import { useEffect, useState } from "react";
import { getJson } from "../api/client";

interface StockListItem {
  id: number;
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
}

export function StockListPage() {
  const [items, setItems] = useState<StockListItem[]>([]);

  useEffect(() => {
    getJson<StockListItem[]>("/api/stock")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="page" data-testid="stock-list-page">
      <table className="stock-table" data-testid="stock-list-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Batch Number</th>
            <th>Serial Number</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-testid={`stock-list-row-${item.id}`}>
              <td>{item.sku}</td>
              <td>{item.location}</td>
              <td>{item.quantity}</td>
              <td
                data-testid={`stock-list-batch-${item.id}`}
                className="stock-table__batch"
              >
                {item.batch_number ?? <span className="empty-state">—</span>}
              </td>
              <td
                data-testid={`stock-list-serial-${item.id}`}
                className="stock-table__serial"
              >
                {item.serial_number ?? <span className="empty-state">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
