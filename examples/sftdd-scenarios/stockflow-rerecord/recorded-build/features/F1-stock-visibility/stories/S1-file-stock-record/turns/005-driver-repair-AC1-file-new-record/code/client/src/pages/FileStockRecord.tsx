import { useState } from "react";
import { fileStockRecord } from "../api/stock";

export function FileStockRecord() {
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [inventoryCode, setInventoryCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fileStockRecord({
        sku,
        location,
        quantity: Number(quantity),
        inventory_code: inventoryCode,
      });
      setFeedback("Stock record filed successfully.");
    } catch {
      setFeedback("Failed to file stock record.");
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
        />
      </div>
      <div>
        <label htmlFor="location">Location</label>
        <input
          id="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="quantity">Quantity</label>
        <input
          id="quantity"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </div>
      <div>
        <label htmlFor="inventory_code">Inventory Code</label>
        <input
          id="inventory_code"
          value={inventoryCode}
          onChange={(e) => setInventoryCode(e.target.value)}
        />
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
