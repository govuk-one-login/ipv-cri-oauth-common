import { beforeEach, describe, expect, it, MockedObject, vi } from "vitest";
import { DeleteSessionLambda } from "../../../src/handlers/delete-session-handler";
import middy, { MiddyfiedHandler } from "@middy/core";
import { ConfigService } from "../../../src/common/config/config-service";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import { logger } from "@govuk-one-login/cri-logger";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import { CommonConfigKey } from "../../../src/types/config-keys";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
// import { SessionService } from "../../../src/services/session-service";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { OAuthSessionItem } from "../../../src/types/oauth-session-item";
import { UnixMillisecondsTimestamp, UnixSecondsTimestamp } from "@govuk-one-login/cri-types";

vi.mock("@govuk-one-login/cri-metrics", () => ({
    metrics: {
        addDimension: vi.fn(),
        publishStoredMetrics: vi.fn(),
        logMetrics: vi.fn(),
    },
    captureMetric: vi.fn(),
}));
vi.mock("@govuk-one-login/cri-logger", () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        clearBuffer: vi.fn(),
        resetKeys: vi.fn(),
        refreshSampleRateCalculation: vi.fn(),
        addContext: vi.fn(),
        logEventIfEnabled: vi.fn(),
        appendKeys: vi.fn(),
    },
}));

const SESSION_DELETED_METRIC = "session_deleted";
const TEST_SESSION_ID = "test-session-id";

describe.only("DeleteSessionLambda", () => {
    let deleteSessionLambda: DeleteSessionLambda;
    let lambdaHandler: MiddyfiedHandler;
    // let sessionService: SessionService;
    let configService: ConfigService;
    let mockDynamoDbClient: MockedObject<typeof DynamoDBDocument>;

    beforeEach(() => {
        vi.clearAllMocks();

        configService = new ConfigService(vi.fn() as unknown as SSMProvider);
        mockDynamoDbClient = vi.mocked(DynamoDBDocument);
        mockDynamoDbClient.prototype.delete = vi.fn().mockResolvedValue({});

        deleteSessionLambda = new DeleteSessionLambda(mockDynamoDbClient.prototype);
        // sessionService = new SessionService(mockDynamoDbClient.prototype, configService);

        configService.init = () => Promise.resolve();
        vi.spyOn(configService, "getConfigEntry").mockReturnValue("test-session-table");

        lambdaHandler = middy(deleteSessionLambda.handler.bind(deleteSessionLambda))
            .use(
                errorMiddleware(logger, {
                    metric_name: SESSION_DELETED_METRIC,
                    message: "DeleteSession Lambda error occurred",
                }),
            )
            .use(
                initialiseConfigMiddleware({
                    configService,
                    config_keys: [CommonConfigKey.SESSION_TABLE_NAME, CommonConfigKey.SESSION_TTL],
                }),
            )
            .use(injectLambdaContext(logger, { resetKeys: true }));
    });

    it("should delete the given session from the table and return a 200 response", async () => {
        const sessionData = createMockSessionItemData();
        vi.spyOn(mockDynamoDbClient.prototype, "put").mockImplementationOnce(async () => ({
            Item: sessionData,
        }));

        const mockEvent = {
            headers: { "session-id": TEST_SESSION_ID },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);
        console.log(`DEBUG: RESULT: ${result.statusCode}`);
        console.log(`DEBUG: RESULT: ${result.body}`);

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain("SUCCESS");
        // expect(sessionService.deleteSession(TEST_SESSION_ID)).toHaveBeenCalledTimes(1);
        expect(mockDynamoDbClient.prototype.delete).toHaveBeenCalledTimes(1);
    });

    it("should fail if a session does not exist", async () => {
        const sessionData = createMockSessionItemData();
        vi.spyOn(mockDynamoDbClient.prototype, "send").mockImplementationOnce(async () => ({
            Item: sessionData,
        }));

        const mockEvent = {
            headers: { "session-id": "bad-session-id" },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);
        expect(result.statusCode).toBe(400);
    });
});

const createMockSessionItemData = (data?: Record<string, string>): OAuthSessionItem =>
    Object.freeze({
        sessionId: TEST_SESSION_ID,
        attemptCount: 1,
        clientId: "test-client-id",
        clientSessionId: "test-client-session-id",
        createdDate: 0 as UnixMillisecondsTimestamp,
        expiryDate: 0 as UnixSecondsTimestamp,
        redirectUri: "https://www.example.com",
        state: "test-state",
        subject: "test-subject",
        vtr: ["P2"] as OAuthSessionItem["vtr"],
        storageAccessToken: "test-storage-access-token",
        persistentSessionId: "test-persistent-session-id",
        context: "test-context",
        accessToken: "secret-access-token",
        authorizationCode: "secret-auth-code",
        clientIpAddress: "192.168.1.1",
        ...(data && { sessionData: data }),
    });
