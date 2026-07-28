Feature: Database migration

  Scenario: Session data is written to the correct table
    Given authorization JAR for test user 681
    When the Session lambda is called
    And user sends a request to session API
    And user gets a session id
    And session has an authCode
    And expect a status code of 201 in the response
    And the Authorisation lambda is called
    And user sends a valid request to authorization end point
    And expect a status code of 200 in the response
    And a valid authorization code is returned in the response
    And the AccessToken lambda is called
    And user sends a request to access token end point
    And expect a status code of 200 in the response
    And a valid access token is returned in the response
    Then the session data is in the correct tables
