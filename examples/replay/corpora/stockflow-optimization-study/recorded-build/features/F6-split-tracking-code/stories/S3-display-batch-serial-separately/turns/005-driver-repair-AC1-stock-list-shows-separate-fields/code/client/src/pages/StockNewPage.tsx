import { useState, type FormEvent } from "react";

// /stock/new page: file a new stock record with batch_number and serial_number
// as first-class separate fields (F6/S3). Styled via the design-guide component
// vocabulary; no inline styles, no hardcoded values, no inventory_code references.
export function StockNewPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setStatus("loading");
    setMessage("");

    try {
      const resp = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: data.get("sku"),
          location: data.get("location"),
          quantity: Number(data.get("quantity")),
          batch_number: data.get("batch_number") || null,
          serial_number: data.get("serial_number") || null,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus("error");
        setMessage((body as { detail?: string }).detail ?? "Submission failed.");
      } else {
        setStatus("success");
        setMessage("Stock record filed.");
        form.reset();
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the server.");
    }
  }

  return (
    <main className="page" data-testid="stock-new-page">
      <h1>File Stock Record</h1>

      <div className="card">
        <form onSubmit={handleSubmit} aria-label="File stock record">
          <div className="field">
            <label htmlFor="sku" className="field__label">
              SKU
            </label>
            <input
              id="sku"
              name="sku"
              type="text"
              className="field__input"
              data-testid="sku-input"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="location" className="field__label">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              className="field__input"
              data-testid="location-input"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="quantity" className="field__label">
              Quantity
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min="0"
              className="field__input"
              data-testid="quantity-input"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="batch_number" className="field__label">
              Batch Number
            </label>
            <input
              id="batch_number"
              name="batch_number"
              type="text"
              className="field__input"
              data-testid="batch-number-input"
            />
          </div>

          <div className="field">
            <label htmlFor="serial_number" className="field__label">
              Serial Number
            </label>
            <input
              id="serial_number"
              name="serial_number"
              type="text"
              className="field__input"
              data-testid="serial-number-input"
            />
          </div>

          <button type="submit" className="btn btn--primary" disabled={status === "loading"}>
            {status === "loading" ? "Filing..." : "File Stock"}
          </button>
        </form>

        {status !== "idle" && status !== "loading" && (
          <p
            role="alert"
            aria-live="polite"
            data-testid="form-status"
            className={status === "success" ? "stock-table__status" : "stock-table__status"}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
