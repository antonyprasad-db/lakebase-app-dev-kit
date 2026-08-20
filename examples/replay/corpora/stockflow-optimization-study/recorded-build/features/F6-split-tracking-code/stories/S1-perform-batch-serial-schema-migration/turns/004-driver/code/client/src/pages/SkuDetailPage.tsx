import { useParams } from "react-router-dom";
import { useSkuDetail } from "../hooks/useSkuDetail";
import type { SkuLocationRow } from "../api/stock";

// SKU detail view (S3): one row per location for a SKU. Every state (loading,
// error, empty, ok) is explicit , never a blank region. Styling comes entirely
// from the design-guide class vocabulary in global.css (no inline styles).
function LocationRow({ row }: { row: SkuLocationRow }) {
  const parUntracked = row.par_level === null || row.par_level === undefined;
  return (
    <li className="location-row" data-testid="location-row">
      <span className="location-row__name">{row.location}</span>
      <span className="location-row__quantity" data-testid="location-quantity">
        {row.quantity}
      </span>
      {row.tracking_code ? (
        <span
          className="location-row__tracking-code"
          data-testid="location-tracking-code"
        >
          {row.tracking_code}
        </span>
      ) : null}
      {parUntracked ? (
        <span
          className="location-row__par-untracked"
          data-testid="par-level-untracked"
        >
          Par level: not tracked
        </span>
      ) : (
        <span className="location-row__par">{row.par_level}</span>
      )}
    </li>
  );
}

export function SkuDetailPage() {
  const { sku = "" } = useParams();
  const detail = useSkuDetail(sku);

  return (
    <main className="page" data-testid="sku-detail-page">
      <h1>SKU {sku}</h1>

      <section className="card" aria-label="Stock by location">
        {detail.status === "loading" && (
          <p className="stock-table__status" role="status">
            Loading SKU detail...
          </p>
        )}
        {detail.status === "error" && (
          <p className="stock-table__status" role="alert">
            Could not load SKU detail: {detail.message}
          </p>
        )}
        {detail.status === "ok" && detail.rows.length === 0 && (
          <p className="stock-table__empty" role="status">
            No stock filed for this SKU
          </p>
        )}
        {detail.status === "ok" && detail.rows.length > 0 && (
          <ul className="location-list">
            {detail.rows.map((row) => (
              <LocationRow key={row.location} row={row} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
