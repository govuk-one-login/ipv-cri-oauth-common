Feature: Delete Session API

  Scenario: Happy Path - a session is successfully deleted
    Given authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then user gets a session id
    And the DeleteSession lambda is called
    When user sends a request to the delete session endpoint
    Then expect a status code of 200 in the response
    And the session no longer exists in the session table

  Scenario: A deleted session cannot be updated, used to create an auth code, or authorized
    Given authorization JAR for test user 681
    And the Session lambda is called
    When user sends a request to session API
    Then user gets a session id
    And the DeleteSession lambda is called
    When user sends a request to the delete session endpoint
    Then expect a status code of 200 in the response
    And the session no longer exists in the session table

    When I create a new session update request
    And The session update request contains the field "field1" set to "test field 1"
    And I send the session update request
    Then expect a status code of 404 in the response

    # POST /create-auth-code should fail
    When session has an authCode
    Then expect a status code of 404 in the response

    # GET /api/authorization should fail
    And the Authorisation lambda is called
    When user sends a valid request to authorization end point
    Then expect a status code of 400 in the response


  Scenario: deleting a session that does not exist returns a 404
    Given the DeleteSession lambda is called
    When user sends a request to delete a non-existent session
    Then expect a status code of 404 in the response