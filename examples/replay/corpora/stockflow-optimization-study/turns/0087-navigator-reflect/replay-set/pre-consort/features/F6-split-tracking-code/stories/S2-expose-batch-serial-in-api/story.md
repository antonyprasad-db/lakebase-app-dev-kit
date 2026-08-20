# S2: Expose batch and serial in API responses

As an API client,
I want to receive batch_number and serial_number as separate fields in the stock response,
so that I can access and display batch and serial information independently without parsing a combined code.

## Scope

Update the stock API endpoint(s) to return batch_number and serial_number as distinct, separately addressable fields in the response JSON, replacing the previous exposure of the combined inventory_code.
