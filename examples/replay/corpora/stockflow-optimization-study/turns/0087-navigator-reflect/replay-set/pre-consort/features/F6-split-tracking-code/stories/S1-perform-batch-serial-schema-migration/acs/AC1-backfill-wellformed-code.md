# AC1: Well-formed code is split into batch and serial

**Given** a stock record whose inventory_code is a well-formed location-batch-serial code such as "A12-B7-S001"
**When** the up migration runs
**Then** that record exposes batch_number and serial_number as distinct, separately addressable fields holding the second and third hyphen-delimited segments ("B7" and "S001") respectively
