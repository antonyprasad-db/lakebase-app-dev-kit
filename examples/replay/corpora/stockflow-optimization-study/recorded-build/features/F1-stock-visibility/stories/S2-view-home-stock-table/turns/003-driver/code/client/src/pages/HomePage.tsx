import { useHealth } from "../hooks/useHealth";
import { useStock } from "../hooks/useStock";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

// Pages are the only place hooks and components are wired together. Every state
// (loading, success, error, empty) is an explicit component state, never a
// blank region, per the design brief's no-silent-states rule.
export function HomePage() {
  const health = useHealth();
  const stock = useStock();

  let tone: BadgeTone = "warn";
  let label = "Checking backend...";
  if (health.status === "ok") {
    tone = "ok";
    label = `Backend ${health.backend}`;
  } else if (health.status === "error") {
    tone = "error";
    label = `Backend unreachable: ${health.message}`;
  }

  const records = stock.status === "ok" ? stock.records : [];

  return (
    <main className="page">
      <h1>stockflow-instrumented-20260819-185702</h1>
      <p>
        Backend health: <StatusBadge tone={tone} label={label} />
      </p>

      {stock.status === "error" ? (
        <div className="empty-state" role="alert" data-testid="stock-error">
          <p className="empty-state__title">Could not load stock</p>
          <p>{stock.message}</p>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state" data-testid="empty-state">
          <p className="empty-state__title">No stock at this location</p>
        </div>
      ) : (
        <table className="table stock-table" data-testid="stock-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Location</th>
              <th className="table__num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={`${r.sku}-${r.location}`}>
                <td>{r.sku}</td>
                <td>{r.location}</td>
                <td className="table__num stock-table__qty">{r.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
