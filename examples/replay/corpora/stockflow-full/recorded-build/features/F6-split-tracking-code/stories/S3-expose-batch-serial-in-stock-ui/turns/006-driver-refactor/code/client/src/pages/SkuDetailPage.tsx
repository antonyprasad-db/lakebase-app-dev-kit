import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSkuDetail, StockDetailRow } from "../api/stock";

export function SkuDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const [rows, setRows] = useState<StockDetailRow[]>([]);

  useEffect(() => {
    if (sku) {
      getSkuDetail(sku).then(setRows).catch(() => setRows([]));
    }
  }, [sku]);

  const parLevelIsNull = rows.length === 0 || rows.every((r) => r.par_level == null);

  return (
    <main className="page" data-testid="sku-detail-page">
      <div className="page__header">
        <h1 className="page__title">{sku}</h1>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Quantity</th>
              <th>Tracking Code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.location} data-testid={`sku-detail-row-${row.location}`}>
                <td data-testid={`sku-detail-location-${row.location}`}>{row.location}</td>
                <td data-testid={`sku-detail-quantity-${row.location}`} className="table__num">
                  {row.quantity}
                </td>
                <td data-testid={`sku-detail-tracking-${row.location}`}>
                  {row.batch_number && row.serial_number
                    ? `${row.batch_number}-${row.serial_number}`
                    : row.batch_number ?? row.serial_number ?? "not tracked"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section data-testid="sku-detail-par-level-section" className="card">
        {parLevelIsNull && (
          <span data-testid="sku-detail-par-level-not-tracked">Not tracked</span>
        )}
      </section>
    </main>
  );
}
