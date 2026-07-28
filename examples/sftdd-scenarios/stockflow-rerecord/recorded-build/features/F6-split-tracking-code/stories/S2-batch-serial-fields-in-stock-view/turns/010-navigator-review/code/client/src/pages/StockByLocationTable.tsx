interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
}

interface Props {
  records: StockRecord[];
}

export function StockByLocationTable({ records }: Props) {
  if (records.length === 0) {
    return (
      <div data-testid="empty-state">No stock at this location</div>
    );
  }

  return (
    <table data-testid="stock-table">
      <tbody>
        {records.map((record) => (
          <tr key={record.sku} data-testid="sku-row">
            <td data-testid={`sku-cell-${record.sku}`}>{record.sku}</td>
            <td data-testid={`location-cell-${record.sku}`}>{record.location}</td>
            <td data-testid={`quantity-cell-${record.sku}`} className="text-right">{record.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
