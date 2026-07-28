export interface StockPayload {
  sku: string;
  location: string;
  quantity: number;
  inventory_code: string;
}

export async function fileStockRecord(payload: StockPayload): Promise<StockPayload> {
  const response = await fetch("/stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
