@ipv_claims
Feature: IPV authorization request claims

  Scenario: an IPV authorisation request is accepted and both claims are stored
    Given IPV authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then user gets a session id
    And the session has the IPV claims

  Scenario: an invalid vtr is rejected
    Given IPV authorization JAR for test user 681 with vtr "P5"
    And the Session lambda is called
    When user sends a request to session API
    Then expect a status code of 400 in the response
    And a "Session Validation Exception" error with code 1019 is sent in the response

  Scenario: a storage access token that is not a signed JWT is rejected
    Given IPV authorization JAR for test user 681 with storage access token "an-opaque-bearer-token"
    And the Session lambda is called
    When user sends a request to session API
    Then expect a status code of 400 in the response
    And a "Session Validation Exception" error with code 1019 is sent in the response

  Scenario: a request without the IPV claims depends on the stack's authorization request type
    Given authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then the session request outcome matches the stack's authorization request type
