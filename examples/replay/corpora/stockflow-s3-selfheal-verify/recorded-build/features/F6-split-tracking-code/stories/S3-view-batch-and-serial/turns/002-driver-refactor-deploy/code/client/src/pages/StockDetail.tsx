import type { StockRecordDto } from "../api/stockRecords";

// The stock detail card (ia.md "SKU detail"). Presentational only: receives
// the record as a prop, never fetches (see hooks/useStockRecordDetail.ts for
// that). Replaces F1's combined tracking code with distinct batch and serial
// fields (S3-view-batch-and-serial); a NULL segment renders an explicit
// "not tracked" placeholder, never a blank region or a crash (AC3).

interface StockDetailProps {
  record: StockRecordDto;
}

function displayOrNotTracked(value: string | null): string {
  return value === null ? "not tracked" : value;
}

export function StockDetail({ record }: StockDetailProps) {
  return (
    <section className="stock-detail" data-testid="stock-detail">
      <h1>{record.sku}</h1>
      <p className="stock-detail__location">{record.location}</p>
      <dl className="stock-detail__fields">
        <div className="stock-detail__field">
          <dt>Quantity</dt>
          <dd
            className="stock-detail__value--mono"
            data-testid="stock-detail-quantity"
          >
            {record.quantity}
          </dd>
        </div>
        <div className="stock-detail__field">
          <dt>Batch</dt>
          <dd data-testid="stock-detail-batch">
            {displayOrNotTracked(record.batch_number)}
          </dd>
        </div>
        <div className="stock-detail__field">
          <dt>Serial</dt>
          <dd data-testid="stock-detail-serial">
            {displayOrNotTracked(record.serial_number)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
