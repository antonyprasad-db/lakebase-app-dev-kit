interface StockEntry {
  sku: string;
  location: string;
  quantity: number;
  batch_number: string | null;
  serial_number: string | null;
}

interface StockViewProps {
  entry: StockEntry;
}

export function StockView({ entry }: StockViewProps) {
  return (
    <div data-testid="stock-view">
      <div>
        <span data-testid="batch-number-label" style={{ fontFamily: "var(--font-sans)" }}>
          Batch Number
        </span>
        <span data-testid="batch-number-field" style={{ fontFamily: "var(--font-mono)" }}>
          {entry.batch_number ?? "none yet"}
        </span>
      </div>
      <div>
        <span data-testid="serial-number-label" style={{ fontFamily: "var(--font-sans)" }}>
          Serial Number
        </span>
        <span data-testid="serial-number-field" style={{ fontFamily: "var(--font-mono)" }}>
          {entry.serial_number ?? "none yet"}
        </span>
      </div>
    </div>
  );
}
