Feature: Session API

  Scenario: a session id is returned
    Given authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then user gets a session id

  Scenario: no session id when no request body
    Given the Session lambda is called
    When user sends an empty request to session end point
    Then expect a status code of 400 in the response

  Scenario: no session id when no client id in request body
    Given authorization JAR for test user 681
    And the Session lambda is called
    And the request body has no client_id
    When user sends a request to session API
    Then expect a status code of 400 in the response

  Scenario: no session id when no request in request body
    Given authorization JAR for test user 681
    And the Session lambda is called
    And the request body has no request
    When user sends a request to session API
    Then expect a status code of 400 in the response

  Scenario: should be able to write, read and update session information
    Given authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then user gets a session id
    When I create a new session update request
    And The session update request contains the field "field1" set to "test field 1"
    And The session update request contains the field "field2" set to "test field 2"
    And The session update request contains the field "field3" set to "test field 3"
    And I send the session update request
    Then expect a status code of 200 in the response

    When I retrieve session information
    Then expect a status code of 200 in the response
    And The session should contain 3 fields
    And The session should contain the field "field1" with the value "test field 1"
    And The session should contain the field "field2" with the value "test field 2"
    And The session should contain the field "field3" with the value "test field 3"
    Then expect a status code of 200 in the response

    When I create a new session update request
    And The session update request contains the field "field2" set to "null"
    And The session update request contains the field "field3" set to "updated test field 3"
    And The session update request contains the field "field4" set to "Test field 4"
    And I send the session update request
    Then expect a status code of 200 in the response

    When I retrieve session information
    Then expect a status code of 200 in the response
    And The session should contain 3 fields
    And The session should contain the field "field1" with the value "test field 1"
    And The session should contain the field "field3" with the value "updated test field 3"
    And The session should contain the field "field4" with the value "Test field 4"
