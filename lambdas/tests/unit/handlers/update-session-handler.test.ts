import { beforeEach, describe, it, MockedObject, vi } from 'vitest';
import { UpdatedSessionLambda } from "../../../src/handlers/update-session-handler";
import { ConfigService } from '../../../src/common/config/config-service';
import { SessionService } from '../../../src/services/session-service';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import middy from '@middy/core';
import errorMiddleware from '../../../src/middlewares/error/error-middleware';
import getSessionByIdMiddleware from '../../../src/middlewares/session/get-session-by-id-middleware';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import setGovUkSigningJourneyIdMiddleware from '../../../src/middlewares/session/set-gov-uk-signing-journey-id-middleware';
import { logger } from '@govuk-one-login/cri-logger';
import initialiseConfigMiddleware from '../../../src/middlewares/config/initialise-config-middleware';
import { CommonConfigKey } from '../../../src/types/config-keys';
import { Context } from 'aws-lambda';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import getUpdateSessionBodyMiddleWare from '../../../src/middlewares/session/get-update-session-body-middleware';
import { SessionItem } from '@govuk-one-login/cri-types';

vi.mock("@aws-sdk/lib-dynamodb");

describe("UpdatedSessionLambda", () => {
  let dynamoDbDocument: MockedObject<typeof DynamoDBDocument>;
  let sessionService: MockedObject<typeof SessionService>;
  let configService: ConfigService;

  let updateSessionHandlerLambda: UpdatedSessionLambda;
  let updateSessionLambda: middy.MiddyfiedHandler;

  beforeEach(() => {
    dynamoDbDocument = vi.mocked(DynamoDBDocument);
    sessionService = vi.mocked(SessionService);
    configService = new ConfigService(vi.fn() as unknown as SSMProvider);

    configService.init = () => Promise.resolve();

    vi.spyOn(sessionService.prototype, 'getSession').mockResolvedValue({
      authorizationCode: 'ORIGINAL',
      sessionId: '00000000-0000-0000-0000-000000000001',
      subject: "elvis"
    } as SessionItem);

    updateSessionHandlerLambda = new UpdatedSessionLambda(configService, dynamoDbDocument.prototype, sessionService.prototype);
    updateSessionLambda = middy(updateSessionHandlerLambda.handler.bind(updateSessionHandlerLambda))
      .use(
        errorMiddleware(logger, {
          metric_name: "session_update",
          message: "Update Session Lambda error occurred",
        }),
      )
      .use(injectLambdaContext(logger, { clearState: true }))
      .use(
        initialiseConfigMiddleware({
          configService: configService,
          config_keys: [CommonConfigKey.SESSION_TABLE_NAME, CommonConfigKey.SESSION_TTL],
        }),
      )
      .use(getUpdateSessionBodyMiddleWare())
      .use(getSessionByIdMiddleware({ sessionService: sessionService.prototype }))
      .use(setGovUkSigningJourneyIdMiddleware(logger));
  });

  it("should world", async () => {
    const value = await updateSessionLambda({
      resource: "/session",
      path: "/session",
      httpMethod: "PUT",
      headers: {
        "session-id": "00000000-0000-0000-0000-000000000001"
      },
      multiValueHeaders: { 
        "session-id": ["00000000-0000-0000-0000-000000000001"] 
      }, 
      queryStringParameters: null, 
      multiValueQueryStringParameters: null, 
      pathParameters: null, 
      stageVariables: null, 
      requestContext: { 
        resourceId: "e2vqpl", 
        resourcePath: "/session", 
        httpMethod: "PUT", 
        extendedRequestId: "Amby3HW4rPEFWSA=", 
        requestTime: "16/Jul/2026:13:16:27 +0000", 
        path: "/session", 
        accountId: "275907361037", 
        protocol: "HTTP/1.1", 
        stage: "test-invoke-stage", 
        domainPrefix: "testPrefix", 
        requestTimeEpoch: 1784207787435, 
        requestId: "de62c63b-fc49-461e-97b8-e6919b94fea9", 
        identity: { 
          "cognitoIdentityPoolId": null, 
          "cognitoIdentityId": null, 
          apiKey: "test-invoke-api-key", 
          principalOrgId: null, 
          cognitoAuthenticationType: null, 
          userArn: "arn:aws:sts::275907361037:assumed-role/AWSReservedSSO_AdministratorAccessPermission_a6a75ca405346e43/chris.peerman@digital.cabinet-office.gov.uk", 
          apiKeyId: "test-invoke-api-key-id", 
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36", 
          accountId: "275907361037", 
          caller: "AROAUAPK4HEGR5Y6Z65CW:chris.peerman@digital.cabinet-office.gov.uk", 
          sourceIp: "test-invoke-source-ip", 
          accessKey: "ASIAUAPK4HEG6TVGAG2G", 
          cognitoAuthenticationProvider: null, 
          user: "AROAUAPK4HEGR5Y6Z65CW:chris.peerman@digital.cabinet-office.gov.uk" 
        }, 
        domainName: "testPrefix.testDomainName", 
        apiId: "g0jxsnyyhf" 
      }, 
      body: "{\n    \"authorizationCode\": \"auth\"\n}", 
      isBase64Encoded: false 
    }, {} as unknown as Context);

  });
});