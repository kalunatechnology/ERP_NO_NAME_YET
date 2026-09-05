Feature: Q10 critical ERP system behaviour
  The application must preserve identity, company isolation, delegated access,
  operational role behaviour, and trustworthy project progress end to end.

  Scenario: Public health and protected resources
    Given the Express application is running
    When an anonymous caller requests health and project resources
    Then health is available and project resources reject the caller

  Scenario: Director reporting access
    Given Rian is authenticated with the Director role
    When Rian requests projects and executive reporting
    Then both resources are readable without granting Super Admin authority

  Scenario: Company Admin governance remains company scoped
    Given Laode is authenticated as Company Admin
    When Laode requests company users and forges another company identifier
    Then users from his company are readable and the forged company is rejected

  Scenario: Operational users keep their canonical roles
    Given Melika and Arof are authenticated
    When their active identities and project access are evaluated
    Then Melika is PM and Arof can operate through his approved PM role

  Scenario: CRM persona can read only its entitled company pipeline
    Given the Ghost CRM Lead is authenticated in the isolated demo company
    When the user requests CRM customer inquiries
    Then the CRM endpoint is readable through that company context

  Scenario: Multi-role switching does not require another login
    Given Arof owns both PM and Finance roles
    When Arof switches to Finance with his current bearer token
    Then Finance becomes active and the test restores PM afterwards

  Scenario: Project progress requires a real WBS hierarchy
    Given a project has no Main Task
    When persisted progress and frontend timeline projection are evaluated
    Then project progress is zero and no synthetic timeline row is produced

  Scenario: Manual WBS progress override is closed
    Given Main and Weekly Tasks use automatic roll-up
    When active override flags are inspected
    Then no Main or Weekly Task bypasses the roll-up engine
