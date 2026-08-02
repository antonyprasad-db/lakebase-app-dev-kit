import { useState } from "react";
import { fileStockRecord } from "../api/stock";
import { ApiError } from "../api/client";

export function FileStockPage() {
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setError(null);
    try {
      await fileStockRecord({
        sku,
        location,
        quantity: Number(quantity),
        batch_number: batchNumber || null,
        serial_number: serialNumber || null,
      });
      setStatus("Stock record filed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <main className="page">
      <h1>File Stock Record</h1>
      <form onSubmit={handleSubmit}>
        <label>
          SKU
          <input
            data-testid="field-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </label>
        <label>
          Location
          <input
            data-testid="field-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          Quantity
          <input
            data-testid="field-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Batch Number
          <input
            data-testid="field-batch-number"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
          />
        </label>
        <label>
          Serial Number
          <input
            data-testid="field-serial-number"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </label>
        <button data-testid="btn-save" type="submit">
          Save
        </button>
      </form>
      {status && <p role="alert">{status}</p>}
      {error && <p role="alert" data-testid="form-error">{error}</p>}
    </main>
  );
}
