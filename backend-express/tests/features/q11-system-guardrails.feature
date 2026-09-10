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

  Scenario: Active role is the authorization context
    Given one account has multiple assigned roles
    When the user selects one active role
    Then unrelated assigned roles cannot authorize another module mutation

  Scenario: Project task access follows management and ownership
    Given a PM manages selected projects and staff owns selected Daily Tasks
    When task rows and mutations are authorized
    Then PM visibility is project-scoped and execution updates remain owner-only

  Scenario: Sensitive workflow actions require the exact active role
    Given module access can be delegated independently from a business role
    Then delegated module access cannot authorize approval or disbursement duties
    And LPJ submission remains restricted to the original requester

  Scenario: Frontend routes and requests share the backend module contract
    Given frontend pages can aggregate data from more than one backend module
    When route visibility and API requests are evaluated
    Then one canonical contract uses the active role and valid entitlements
    And unauthorized cross-module requests are cancelled before transmission
