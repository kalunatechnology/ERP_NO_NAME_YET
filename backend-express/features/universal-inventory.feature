Feature: Universal Inventory & Asset Management (Phases 1 - 4)
  As an ERP platform operator and auditor
  I want double-entry ledger integrity, FEFO compliance, configurable DoA workflows, warehouse ABAC, intercompany STO, composable industry extensions, DDMRP, webhooks, EPCIS 2.0, and Material Ledger PUP
  So that every inventory movement across industries is safe, auditable, and accurate.

  Scenario: Phase 1 - Double-entry receipt uses virtual vendor counterpart without creating virtual balance
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And product "SKU-BOX" is active with stock tracking enabled and FIFO costing
    And physical warehouse location "LOC-WH-A" exists
    When a RECEIPT stock move of 10 units at cost 50000 into "LOC-WH-A" is posted
    Then the stock move status is "COMPLETED"
    And the move source location is auto-linked to virtual counterpart "VIRT-VENDOR"
    And physical location "LOC-WH-A" has on-hand 10 and inventory value 500000
    And virtual counterpart "VIRT-VENDOR" has zero balance rows

  Scenario: Phase 1 - FEFO auto-allocates earliest-expiring lot and blocks expired lot issuance
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And lot-controlled product "SKU-MED" is active with FIFO costing
    And physical warehouse location "LOC-WH-A" exists
    And lot "LOT-EXPIRED" expired yesterday with 5 units in "LOC-WH-A"
    And lot "LOT-SOON" expires in 10 days with 4 units in "LOC-WH-A"
    And lot "LOT-LATER" expires in 60 days with 6 units in "LOC-WH-A"
    When an ISSUE stock move of 7 units from "LOC-WH-A" without manual lot is posted
    Then FEFO allocates 4 units from "LOT-SOON" and 3 units from "LOT-LATER"
    And "LOT-EXPIRED" remains untouched with 5 units
    When an ISSUE stock move of 1 unit explicitly using "LOT-EXPIRED" to customer is attempted
    Then the posting fails with validation error containing "FEFO Compliance"

  Scenario: Phase 2 - Configurable workflow enforces DoA tier threshold and SoD
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And a TRANSFER_ORDER workflow rule requires Tier 1 for amounts >= 50000000 with SoD
    When a Tier 2 supervisor attempts to approve a transfer worth 75000000
    Then the workflow evaluation rejects with "Otorisasi DoA"
    When a Tier 1 director attempts to approve their own transfer request
    Then the workflow evaluation rejects with "Segregation of Duties"
    When a different Tier 1 director approves the transfer worth 75000000
    Then the workflow evaluation succeeds with required tier 1

  Scenario: Phase 2 - Warehouse ABAC scope restricts access to assigned warehouse only
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And user "STAFF-1" is scoped only to warehouse "WH-1" with write access
    Then "STAFF-1" is allowed "write" on warehouse "WH-1"
    And "STAFF-1" is denied "write" on warehouse "WH-2" with "ABAC Warehouse Scope"

  Scenario: Phase 2 - Intercompany STO dispatches from supplying company and receives in requesting company
    Given an isolated in-memory inventory sandbox for multi-company tenant "TENANT-1"
    And "COMP-B" has 20 units of "SKU-IC" at cost 25000 in "LOC-B"
    And "COMP-A" has receiving location "LOC-A"
    When an Intercompany STO for 5 units from "COMP-B" to "COMP-A" is created, approved, dispatched, and received
    Then the Intercompany STO status is "RECEIVED"
    And "COMP-B" balance in "LOC-B" is 15 units
    And "COMP-A" balance in "LOC-A" is 5 units at value 125000
    And outbox events include "inventory.intercompany.dispatched" and "inventory.intercompany.received"

  Scenario: Phase 3 - Industry extensions are gated by company feature flags
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And product "SKU-POS" has 10 units in store location "LOC-STORE"
    When a Retail POS sale deduction of 2 units is attempted while "RETAIL_POS" is disabled
    Then the operation is rejected with "belum diaktifkan"
    When extension "RETAIL_POS" is enabled for company "COMP-A"
    And a Retail POS sale deduction of 2 units is posted for receipt "POS-001"
    Then store location "LOC-STORE" has 8 units remaining

  Scenario: Phase 4 - DDMRP evaluation, HMAC webhook dispatch, GS1 EPCIS 2.0, and Material Ledger PUP
    Given an isolated in-memory inventory sandbox for company "COMP-A"
    And DDMRP buffer for "SKU-DDMRP" has ADU 10, DLT 5, LTF 0.4, VF 0.5, MOQ 25 and available stock 20
    When DDMRP buffers are evaluated
    Then "SKU-DDMRP" zone status is "CRITICAL_RED" with recommended order 85
    When an active webhook subscription receives a PENDING outbox event
    Then the webhook HTTP POST carries an "X-Arsalynt-Signature" sha256 HMAC header
    And the outbox event status becomes "PROCESSED"
    When GS1 EPCIS 2.0 events and Material Ledger PUP are queried
    Then the EPCIS document type is "EPCISDocument" with CBV 2.0 events
    And Material Ledger PUP returns positive periodic unit price
