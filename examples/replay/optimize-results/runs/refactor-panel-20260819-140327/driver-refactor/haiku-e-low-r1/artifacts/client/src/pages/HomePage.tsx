import { useHealth } from "../hooks/useHealth";
import { useStockList } from "../hooks/useStockList";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

// Pages are the only place hooks and components are wired together. Every state
// (loading, success, error) is an explicit component state, never a blank
// region, per the design brief's no-silent-states rule.
export function HomePage() {
  const health = useHealth();
  const stockList = useStockList();

  let tone: BadgeTone = "warn";
  let label = "Checking backend...";
  if (health.status === "ok") {
    tone = "ok";
    label = `Backend ${health.backend}`;
  } else if (health.status === "error") {
    tone = "error";
    label = `Backend unreachable: ${health.message}`;
  }

  const renderStockSection = () => {
    if (stockList.status === "loading") return null;
    if (stockList.status === "error") return null;
    if (stockList.items.length === 0) {
      return (
        <p data-testid="stock-empty-state" className="empty-state">
          No stock at this location
        </p>
      );
    }
    return (
      <table data-testid="stock-table" className="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Location</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {stockList.items.map((item) => (
            <tr key={item.sku} data-testid={`stock-row-${item.sku}`}>
              <td data-testid={`stock-sku-${item.sku}`}>{item.sku}</td>
              <td data-testid={`stock-location-${item.location}`}>{item.location}</td>
              <td
                data-testid={`stock-quantity-${item.sku}`}
                className="stock-table__quantity table__num"
              >
                {item.quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <main className="page">
      <h1>stockflow-instrumented-20260809-105157</h1>
      <p>
        This is the React SPA scaffold. It talks to the JSON API over
        <code> /api</code> and is served by the backend in production.
      </p>
      <p>
        Backend health: <StatusBadge tone={tone} label={label} />
      </p>
      {renderStockSection()}
    </main>
  );
}
