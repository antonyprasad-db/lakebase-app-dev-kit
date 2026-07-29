# Pick stock for a customer order

The team needs to pick goods off the shelf for a customer order, drawing stock down at a location, without ever promising more than is actually there. This closes the basic in-and-out loop for the warehouse.

Concretely for this feature:

- Record an outbound pick: a SKU, a quantity, and the location it comes from. Recording the pick decreases the stock level at that location.
- A pick can never overcommit. If the requested quantity exceeds what is available at that location, the pick is rejected at write time, never stored as a negative balance and never allowed as a silent double-allocation against the same stock (R2).
- The pick form has visible, persistent labels and lands on a confirmation when saved. A rejected pick (over-available, unknown SKU, non-positive quantity) is shown inline next to the offending field, naming it (for example "only 3 available at A-12").
- Each pick keeps an unmodifiable record of when it happened and who made it, consistent with adjustments and receipts.

Builds on F1-stock-visibility (stock records) and shares the audit + validation conventions established by F2-stock-adjustment and F3-inbound-receipt.
