import { beforeEach, describe, expect, it, MockedObject, vi } from "vitest";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { CreateAuthCodeLambda } from "../../../src/handlers/create-auth-code-handler";
import middy, { MiddyfiedHandler } from "@middy/core";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { ConfigService } from "../../../src/common/config/config-service";
import { CommonConfigKey } from "../../../src/types/config-keys";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import { logger } from "@govuk-one-login/cri-logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { UnixSecondsTimestamp } from "@govuk-one-login/cri-types";

vi.mock("@aws-sdk/lib-dynamodb");
vi.mock("../../../src/common/config/config-service");
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

const AUTH_CODE_CREATED_METRIC = "auth_code_created";

describe("CreateAuthCodeLambda", () => {
    let createAuthCodeLambda: CreateAuthCodeLambda;
    let lambdaHandler: MiddyfiedHandler;
    let configService: MockedObject<typeof ConfigService>;
    let mockDynamoDbClient: MockedObject<typeof DynamoDBDocument>;

    beforeEach(() => {
        vi.clearAllMocks();

        configService = vi.mocked(ConfigService);
        mockDynamoDbClient = vi.mocked(DynamoDBDocument);
        mockDynamoDbClient.prototype.send = vi.fn().mockResolvedValue({});

        vi.spyOn(configService.prototype, "init").mockResolvedValue();
        vi.spyOn(configService.prototype, "getConfigEntry").mockReturnValue("test-session-table");
        vi.spyOn(configService.prototype, "getAuthorizationCodeExpirationEpoch").mockReturnValue(
            1000 as UnixSecondsTimestamp,
        );

        createAuthCodeLambda = new CreateAuthCodeLambda(configService.prototype, mockDynamoDbClient.prototype);

        lambdaHandler = middy(createAuthCodeLambda.handler.bind(createAuthCodeLambda))
            .use(
                errorMiddleware(logger, {
                    metric_name: AUTH_CODE_CREATED_METRIC,
                    message: "Create Auth Code error occurred",
                }),
            )
            .use(injectLambdaContext(logger, { clearState: true }))
            .use(
                initialiseConfigMiddleware({
                    configService: configService.prototype,
                    config_keys: [CommonConfigKey.SESSION_TABLE_NAME],
                }),
            );
    });

    it("should create an authorization code for the session", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(201);
    });
    it("should not update an authorization code for the session if it already exists", async () => {
        mockDynamoDbClient.prototype.send = vi
            .fn()
            .mockRejectedValue(new ConditionalCheckFailedException({ $metadata: {}, message: "Condition not met" }));

        const mockEvent = {
            headers: { "session-id": "test-session-id" },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(200);
    });

    it("should return a 500 error when DynamoDB throws an unexpected error", async () => {
        mockDynamoDbClient.prototype.send = vi.fn().mockRejectedValue(new Error("Internal DynamoDB error"));

        const mockEvent = {
            headers: { "session-id": "test-session-id" },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual(expect.objectContaining({ message: "Server Error" }));
    });
});
