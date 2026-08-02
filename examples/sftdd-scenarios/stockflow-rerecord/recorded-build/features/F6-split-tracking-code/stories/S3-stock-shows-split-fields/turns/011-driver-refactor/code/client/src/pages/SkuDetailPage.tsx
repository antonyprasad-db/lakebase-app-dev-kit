import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchSkuDetail, SkuDetailEntry } from "../api/stock";

export function SkuDetailPage() {
  const { pathname } = useLocation();
  // Expect path of the form /sku/<sku>
  const segments = pathname.split("/").filter(Boolean);
  const sku = segments[1] ?? "";

  const [entries, setEntries] = useState<SkuDetailEntry[] | null>(null);

  useEffect(() => {
    fetchSkuDetail(sku).then(setEntries);
  }, [sku]);

  if (entries === null) {
    return null;
  }

  if (entries.length === 0) {
    return (
      <div data-testid="empty-state">No stock for this SKU</div>
    );
  }

  return (
    <div className="page">
      <table className="sku-detail-table" data-testid="sku-detail-table">
        <tbody>
          {entries.map((e) => (
            <tr key={e.location} data-testid={`sku-detail-row-${e.location}`}>
              <td>{e.location}</td>
              <td data-testid={`sku-detail-qty-${e.location}`}>{e.quantity}</td>
              <td data-testid={`sku-detail-batch-${e.location}`}>{e.batch_number ?? "none"}</td>
              <td data-testid={`sku-detail-serial-${e.location}`}>{e.serial_number ?? "none"}</td>
              <td data-testid={`sku-detail-par-${e.location}`}>
                {e.par_level === null ? "not tracked" : e.par_level}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
