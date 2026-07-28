export interface StockPayload {
  sku: string;
  location: string;
  quantity: number;
  inventory_code: string;
}

export interface ValidationError {
  fieldErrors: Record<string, string>;
  message: string;
}

export async function fileStockRecord(payload: StockPayload): Promise<StockPayload> {
  const response = await fetch("/stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    if (response.status === 422) {
      const errorBody = await response.json();
      const fieldErrors: Record<string, string> = {};
      if (errorBody.detail && Array.isArray(errorBody.detail)) {
        errorBody.detail.forEach(
          (err: { loc: (string | number)[]; msg: string }) => {
            if (err.loc && err.loc.length > 1) {
              const fieldName = String(err.loc[1]);
              fieldErrors[fieldName] = err.msg;
            }
          }
        );
      }
      const error = new Error("Validation failed") as Error & ValidationError;
      error.fieldErrors = fieldErrors;
      error.message = Object.entries(fieldErrors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join("; ");
      throw error;
    }
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
