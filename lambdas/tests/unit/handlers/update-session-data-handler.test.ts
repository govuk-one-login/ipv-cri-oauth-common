import { beforeEach, describe, expect, it, MockedObject, vi } from "vitest";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { UpdateSessionDataLambda } from "../../../src/handlers/update-session-data-handler";
import middy, { MiddyfiedHandler } from "@middy/core";
import { DynamoDBDocument, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ConfigService } from "../../../src/common/config/config-service";
import { CommonConfigKey } from "../../../src/types/config-keys";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import { logger } from "@govuk-one-login/cri-logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";

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

const SESSION_DATA_UPDATED_METRIC = "session_data_updated";

describe("UpdateSessionDataLambda", () => {
    let updateSessionDataLambda: UpdateSessionDataLambda;
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

        updateSessionDataLambda = new UpdateSessionDataLambda(configService.prototype, mockDynamoDbClient.prototype);

        lambdaHandler = middy(updateSessionDataLambda.handler.bind(updateSessionDataLambda))
            .use(
                errorMiddleware(logger, {
                    metric_name: SESSION_DATA_UPDATED_METRIC,
                    message: "Update Session Data error occurred",
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

    it("should update session data with key-value pairs", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: JSON.stringify({ property1: "abc", property2: 123, property3: true }),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(200);
        expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(2);
    });

    it("should update session data with nested objects", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: JSON.stringify({
                property1: "abc",
                property2: { innerProperty1: "xyz", innerProperty2: 246 },
            }),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(200);
        expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(2);
    });

    it("should use the REMOVE update expression when a key's value is null", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: JSON.stringify({ testProperty: null }),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(200);
        expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(2);

        const mockedUpdateCommand = vi.mocked(UpdateCommand);
        const secondUpdateCommandArgs = mockedUpdateCommand.mock.calls[1][0];
        expect(secondUpdateCommandArgs).toEqual(
            expect.objectContaining({
                UpdateExpression: "REMOVE #sessionData.#testProperty",
                Key: { sessionId: "test-session-id" },
            }),
        );
    });

    it("should return 400 when request body is missing", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: null,
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual(expect.objectContaining({ message: "Missing request body" }));
    });

    it("should return 400 when request body is not valid JSON", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: "testString",
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual(
            expect.objectContaining({ message: "Request body must be valid JSON" }),
        );
    });

    it("should return 400 when request body is an empty object", async () => {
        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: JSON.stringify({}),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual(
            expect.objectContaining({ message: "Request body must contain at least one property to update" }),
        );
    });

    it("should return 400 when session-id header is missing", async () => {
        const mockEvent = {
            headers: {},
            body: JSON.stringify({ testProperty: "abc123" }),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual(
            expect.objectContaining({ message: "Invalid request: Missing session-id header" }),
        );
    });

    it("should return a 500 error when DynamoDB throws an unexpected error", async () => {
        mockDynamoDbClient.prototype.send = vi.fn().mockRejectedValue(new Error("Internal DynamoDB error"));

        const mockEvent = {
            headers: { "session-id": "test-session-id" },
            body: JSON.stringify({ testProperty: "abc123" }),
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual(expect.objectContaining({ message: "Server Error" }));
    });
});
