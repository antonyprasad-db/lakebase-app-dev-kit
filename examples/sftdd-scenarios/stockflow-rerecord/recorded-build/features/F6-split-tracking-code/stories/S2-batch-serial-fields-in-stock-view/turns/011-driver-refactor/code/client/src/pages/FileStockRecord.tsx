import { useState } from "react";
import { fileStockRecord, ValidationError } from "../api/stock";

export function FileStockRecord() {
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    try {
      await fileStockRecord({
        sku,
        location,
        quantity: Number(quantity),
      });
      setFeedback("Stock record filed successfully.");
      setFieldErrors({});
    } catch (err) {
      const error = err as Error & ValidationError;
      if (error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        setFeedback(error.message || "Validation failed.");
      } else {
        setFeedback("Failed to file stock record.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="sku">SKU</label>
        <input
          id="sku"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          aria-invalid={!!fieldErrors.sku}
        />
        {fieldErrors.sku && (
          <span role="alert" className="error" data-testid="sku-error">
            {fieldErrors.sku}
          </span>
        )}
      </div>
      <div>
        <label htmlFor="location">Location</label>
        <input
          id="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          aria-invalid={!!fieldErrors.location}
        />
        {fieldErrors.location && (
          <span role="alert" className="error" data-testid="location-error">
            {fieldErrors.location}
          </span>
        )}
      </div>
      <div>
        <label htmlFor="quantity">Quantity</label>
        <input
          id="quantity"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
          aria-invalid={!!fieldErrors.quantity}
        />
        {fieldErrors.quantity && (
          <span role="alert" className="error" data-testid="quantity-error">
            {fieldErrors.quantity}
          </span>
        )}
      </div>
      <button type="submit" data-testid="submit-btn">File Stock Record</button>
      {feedback && (
        <div role="alert" aria-live="polite" data-testid="feedback-message">
          {feedback}
        </div>
      )}
    </form>
  );
}
