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
    <div data-testid="sku-detail-page">
      <h1>{sku}</h1>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.location} data-testid={`sku-detail-row-${row.location}`}>
              <td data-testid={`sku-detail-location-${row.location}`}>{row.location}</td>
              <td data-testid={`sku-detail-quantity-${row.location}`}>{row.quantity}</td>
              <td data-testid={`sku-detail-tracking-${row.location}`}>{row.inventory_code}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section data-testid="sku-detail-par-level-section">
        {parLevelIsNull && (
          <span data-testid="sku-detail-par-level-not-tracked">Not tracked</span>
        )}
      </section>
    </div>
  );
}
