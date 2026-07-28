interface LocationEntry {
  location: string;
  quantity: number;
  tracking_code: string | null;
}

interface SkuDetailViewProps {
  sku: string;
  locations: LocationEntry[];
}

export function SkuDetailView({ sku, locations }: SkuDetailViewProps) {
  return (
    <div data-testid="sku-detail-page">
      <h1>{sku}</h1>
      <table>
        <tbody>
          {locations.map((entry) => (
            <tr key={entry.location} data-testid="sku-row">
              <td data-testid={`location-cell-${entry.location}`}>
                {entry.location}
              </td>
              <td data-testid={`quantity-cell-${entry.location}`}>
                {entry.quantity}
              </td>
              <td data-testid={`tracking-detail-${entry.location}`}>
                {entry.tracking_code ?? "not tracked"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
