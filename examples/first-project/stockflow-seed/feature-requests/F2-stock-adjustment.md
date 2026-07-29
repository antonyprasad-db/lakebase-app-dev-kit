# Adjust the stock level of a SKU at a location

When the count on the shelf does not match what the system says, the team needs to correct it. This is the write path that makes the inventory trustworthy.

Concretely for this feature:

- Adjust the stock level of one SKU at one location to a corrected value (or by a delta).
- Every adjustment keeps an unmodifiable record of when it happened and who made it. That audit trail is never editable after the fact.
- Stock can never go below zero. An adjustment that would drive it negative is rejected at write time, never stored as a negative.
- The adjustment form has visible, persistent labels. A successful save lands on a confirmation (or a green inline flash); a rejected adjustment is shown inline next to the field that caused it, naming the field (for example "quantity would go below zero"), never a generic "bad request".

Builds directly on the stock records from F1-stock-visibility.
