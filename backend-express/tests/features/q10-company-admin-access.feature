Feature: Company Admin delegates company-approved modules safely
  Laode must be able to manage each user's operational module access without
  acquiring Super Admin authority or crossing company boundaries.

  Scenario: Company Admin loads the access workspace
    Given Laode is the active Company Admin
    When the UI requests company users, approved modules, and personal overrides
    Then all three resources are available in Laode's company context

  Scenario Outline: Company Admin selects an explicit access level
    Given Finance is approved for Laode's company
    When Laode assigns <mode> to Jundy
    Then the persisted override is <read> read and <write> write

    Examples:
      | mode       | read  | write |
      | blocked    | false | false |
      | view-only  | true  | false |
      | full-write | true  | true  |

  Scenario: Write access always includes read access
    Given Jundy has no explicit Finance access
    When Laode requests write without read
    Then the backend stores both read and write

  Scenario: Saved access survives a workspace reload
    Given Laode has assigned Finance access to Jundy
    When personal overrides are loaded again
    Then the same access state is returned

  Scenario: Role default removes the personal override
    Given Jundy has an explicit Finance override
    When Laode selects Role default
    Then the explicit override is deleted and role authorization applies again

  Scenario: Company Admin cannot change their own access
    Given Laode is the target user
    When Laode attempts a personal module change
    Then the API rejects self-escalation

  Scenario: Company Admin cannot manage another company user
    Given a Ghost user belongs to another company
    When Laode attempts to change the Ghost user's module access
    Then the API rejects the cross-company target

  Scenario: Ordinary users cannot administer access
    Given Jundy is authenticated without Company Admin role
    When Jundy attempts to change another user's module access
    Then the API rejects the administration request

  Scenario: Unapproved modules cannot be delegated
    Given a module is absent from the company entitlement catalog
    When Laode attempts to delegate that module
    Then the API rejects the unknown module and creates no override

  Scenario: Company Admin cannot alter commercial entitlement
    Given Finance is enabled by Super Admin
    When Laode attempts to disable Finance for the company
    Then the API rejects the change and Finance remains enabled
