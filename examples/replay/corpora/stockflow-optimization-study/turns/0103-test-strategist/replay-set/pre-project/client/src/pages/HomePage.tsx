import { useHealth } from "../hooks/useHealth";
import { useStock } from "../hooks/useStock";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";
import { StockTable } from "../components/StockTable";

// Pages are the only place hooks and components are wired together. Every state
// (loading, success, error) is an explicit component state, never a blank
// region, per the design brief's no-silent-states rule.
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

  return (
    <main className="page">
      <h1>stockflow-instrumented-20260819-185702</h1>
      <p>
        Backend health: <StatusBadge tone={tone} label={label} />
      </p>

      <section className="card" aria-label="Stock on hand">
        {stock.status === "loading" && (
          <p className="stock-table__status" role="status">
            Loading stock...
          </p>
        )}
        {stock.status === "error" && (
          <p className="stock-table__status" role="alert">
            Could not load stock: {stock.message}
          </p>
        )}
        {stock.status === "ok" && <StockTable records={stock.records} />}
      </section>
    </main>
  );
}
