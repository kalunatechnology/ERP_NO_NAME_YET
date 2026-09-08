Feature: Q11 system-wide safety guardrails
  Generic infrastructure must fail closed so future modules cannot silently
  create synthetic business data or bypass protected workflows.

  Scenario: Missing approval state never becomes approved
    Given a generic CRUD payload omits its approval state
    When required fields are normalized
    Then the record remains pending approval

  Scenario: Missing business identity is rejected
    Given a project payload has no real project or customer name
    When generic CRUD normalization is applied
    Then the invalid payload is rejected instead of receiving placeholder data

  Scenario: Terminal finance records remain immutable
    Given a finance record is posted or paid
    When any generic single or bulk mutation evaluates it
    Then the mutation is rejected and must use an official reversal workflow

  Scenario: Quick login stays isolated from operational data
    Given local testing accounts remain available on the login page
    When operational project sources are inspected
    Then quick login is localhost-gated and no demo team fallback is present

  Scenario: Production build enforces safety checks
    Given Hostinger performs the production backend build
    When compilation and deployment validation run
    Then Q11 is mandatory and demo seeding remains blocked in production
