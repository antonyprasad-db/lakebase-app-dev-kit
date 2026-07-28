# S2 - Show batch and serial as distinct fields in the stock view

As a warehouse operator,
I want each stock record to display batch and serial as separate, labelled fields wherever the combined tracking code used to appear,
so that I can read a stock position's identity unambiguously, including a clear "none yet" for rows whose old code had no batch or serial.

Scope (one line): the SPA stock view surfaces `batch_number` and `serial_number` as distinct labelled fields (replacing the old combined `inventory_code` display), showing an explicit "none yet" where a field is NULL.
