import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJson } from "../api/client";

interface StockDetailRecord {
  id: number;
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
  par_level: number | null;
}

export function StockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<StockDetailRecord | null>(null);

  useEffect(() => {
    if (id) {
      getJson<StockDetailRecord>(`/api/stock/detail/${id}`)
        .then(setRecord)
        .catch(() => setRecord(null));
    }
  }, [id]);

  return (
    <main className="page" data-testid="stock-detail-page">
      {record && (
        <div className="card" data-testid="stock-detail-card">
          <div data-testid="stock-detail-sku">{record.sku}</div>
          <div data-testid="stock-detail-quantity">{record.quantity}</div>
          <div data-testid="stock-detail-batch-number">
            {record.batch_number ?? <span className="empty-state">not tracked</span>}
          </div>
          <div data-testid="stock-detail-serial-number">
            {record.serial_number ?? <span className="empty-state">not tracked</span>}
          </div>
        </div>
      )}
    </main>
  );
}
