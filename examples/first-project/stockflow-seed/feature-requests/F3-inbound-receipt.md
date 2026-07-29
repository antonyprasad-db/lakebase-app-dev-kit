# Record an inbound receipt from a supplier

The team needs to receive inbound goods: a known supplier delivers a known quantity, and stock goes up at a chosen location. This is the first inbound workflow.

Concretely for this feature:

- Record a receipt: a supplier, a SKU, a quantity, and the location it lands at. Recording the receipt increases the stock level at that location.
- The receipt form has visible, persistent labels and lands on a confirmation when saved. A problem (unknown SKU, missing supplier, non-positive quantity) is shown inline next to the offending field, naming it.
- The stock increase preserves the same audit expectations as adjustments: when it happened and who recorded it, unmodifiable after the fact.
- The schema change that adds receipts is additive: existing stock records from F1 and F2 keep working, and old reads do not break.

Builds on F1-stock-visibility (stock records) and shares the audit and validation conventions from F2-stock-adjustment.
