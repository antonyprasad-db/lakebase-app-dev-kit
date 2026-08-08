import { useHealth } from "../hooks/useHealth";
import { useStockRecords } from "../hooks/useStockRecords";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";
import { StockTable } from "./StockTable";

// Pages are the only place hooks and components are wired together. Every state
// (loading, success, error) is an explicit component state, never a blank
// region, per the design brief's no-silent-states rule.
export function HomePage() {
  const health = useHealth();
  const stock = useStockRecords();

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
      <h1>StockFlow</h1>
      <p>
        Backend health: <StatusBadge tone={tone} label={label} />
      </p>
      {stock.status === "loading" && <p>Loading stock...</p>}
      {stock.status === "error" && (
        <p data-testid="stock-error">Stock unavailable: {stock.message}</p>
      )}
      {stock.status === "ok" && <StockTable rows={stock.records} />}
    </main>
  );
}
