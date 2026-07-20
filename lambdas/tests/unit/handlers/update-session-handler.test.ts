import { beforeEach, describe, expect, it, MockedObject, vi } from "vitest";
import { UpdatedSessionLambda } from "../../../src/handlers/update-session-handler";
import { ConfigService } from "../../../src/common/config/config-service";
import { SessionService } from "../../../src/services/session-service";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import middy from "@middy/core";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import setGovUkSigningJourneyIdMiddleware from "../../../src/middlewares/session/set-gov-uk-signing-journey-id-middleware";
import { logger } from "@govuk-one-login/cri-logger";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import { CommonConfigKey } from "../../../src/types/config-keys";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import getUpdateSessionBodyMiddleWare from "../../../src/middlewares/session/get-update-session-body-middleware";
import { SessionItem } from "@govuk-one-login/cri-types";

vi.mock("@aws-sdk/lib-dynamodb");

const TEST_SESSION_ID = "00000000-0000-0000-0000-000000000001";
const TEST_NEW_AUTH_CODE = "UmVwbGFjZW1lbnQgVmFsdWUK";

const createTestRequest = (sessionId: string, session?: SessionItem): APIGatewayProxyEvent =>
    ({
        headers: {
            "session-id": sessionId,
        },
        body: session ? JSON.stringify(session) : null,
    }) as never as APIGatewayProxyEvent;

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

        updateSessionHandlerLambda = new UpdatedSessionLambda(
            configService,
            dynamoDbDocument.prototype,
            sessionService.prototype,
        );
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
            .use(setGovUkSigningJourneyIdMiddleware(logger));
    });

    it("should call the session service when the authorization code is not present", async () => {
        const updateSessionSpy = vi.spyOn(sessionService.prototype, "updateSession");
        const request = createTestRequest(TEST_SESSION_ID);
        const response = await updateSessionLambda(request, {} as Context);

        expect(response).toStrictEqual({ statusCode: 204 });
        expect(updateSessionSpy).toHaveBeenCalledWith({
            sessionId: TEST_SESSION_ID,
            clientSessionId: undefined,
        });
    });

    it("should call the session service when the authorization code is present", async () => {
        const updateSessionSpy = vi.spyOn(sessionService.prototype, "updateSession");
        const request = createTestRequest(TEST_SESSION_ID, {
            authorizationCode: TEST_NEW_AUTH_CODE,
        } as never as SessionItem);
        const response = await updateSessionLambda(request, {} as Context);

        expect(response).toStrictEqual({ statusCode: 204 });
        expect(updateSessionSpy).toHaveBeenCalledWith({
            sessionId: TEST_SESSION_ID,
            authorizationCode: TEST_NEW_AUTH_CODE,
            clientSessionId: undefined,
        });
    });
});
