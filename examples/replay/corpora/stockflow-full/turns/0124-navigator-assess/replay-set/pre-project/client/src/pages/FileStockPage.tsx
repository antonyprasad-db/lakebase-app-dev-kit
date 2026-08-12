import { useState } from "react";

export function FileStockPage() {
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          location,
          quantity: Number(quantity),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg(JSON.stringify(body?.detail ?? "Request failed"));
      } else {
        setStatus("success");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  return (
    <main className="page">
      <div className="page__header">
        <h1 className="page__title">
          <img className="page__title-icon" src="/favicon.svg" alt="" />
          <span>File Stock</span>
        </h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="sku-input">SKU</label>
            <input
              id="sku-input"
              data-testid="sku-input"
              className="field__input"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="location-input">Location</label>
            <input
              id="location-input"
              data-testid="location-input"
              className="field__input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="quantity-input">Quantity</label>
            <input
              id="quantity-input"
              data-testid="quantity-input"
              className="field__input"
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <button
            data-testid="file-stock-submit"
            className="btn btn--primary"
            type="submit"
          >
            File Stock
          </button>
        </form>
        {status === "success" && (
          <div role="alert" aria-live="polite" className="toast toast--success">
            Stock filed successfully.
          </div>
        )}
        {status === "error" && (
          <div role="alert" aria-live="assertive" className="toast toast--error">
            {errorMsg}
          </div>
        )}
      </div>
    </main>
  );
}
