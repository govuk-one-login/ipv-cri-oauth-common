import { beforeEach, describe, expect, it, MockedObject, vi } from "vitest";
import { DeleteSessionLambda } from "../../../src/handlers/delete-session-handler";
import middy, { MiddyfiedHandler } from "@middy/core";
import { ConfigService } from "../../../src/common/config/config-service";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import { logger } from "@govuk-one-login/cri-logger";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import { CommonConfigKey } from "../../../src/types/config-keys";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { SessionService } from "../../../src/services/session-service";
import { SessionNotFoundError } from "../../../src/common/utils/errors";

vi.mock("@aws-sdk/lib-dynamodb");
vi.mock("../../../src/services/session-service");
vi.mock("../../../src/common/config.config-service");
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

describe("DeleteSessionLambda", () => {
    let deleteSessionLambda: DeleteSessionLambda;
    let lambdaHandler: MiddyfiedHandler;
    let configService: MockedObject<typeof ConfigService>;
    let sessionService: MockedObject<typeof SessionService>;

    beforeEach(() => {
        vi.clearAllMocks();

        configService = vi.mocked(ConfigService);
        vi.spyOn(configService.prototype, "init").mockResolvedValue();
        vi.spyOn(configService.prototype, "getConfigEntry").mockReturnValue("test-session-table");

        sessionService = vi.mocked(SessionService);
        vi.spyOn(sessionService.prototype, "deleteSession").mockResolvedValue(undefined as never);

        deleteSessionLambda = new DeleteSessionLambda(sessionService.prototype);

        lambdaHandler = middy(deleteSessionLambda.handler.bind(deleteSessionLambda))
            .use(
                errorMiddleware(logger, {
                    metric_name: SESSION_DELETED_METRIC,
                    message: "DeleteSessionFn Lambda error occurred",
                }),
            )
            .use(
                initialiseConfigMiddleware({
                    configService: configService.prototype,
                    config_keys: [CommonConfigKey.SESSION_TABLE_NAME, CommonConfigKey.SESSION_TTL],
                }),
            )
            .use(injectLambdaContext(logger, { resetKeys: true }));
    });

    it("should delete the given session from the table and return a 200 response", async () => {
        const mockEvent = {
            headers: { "session-id": TEST_SESSION_ID },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(200);

        expect(sessionService.prototype.deleteSession).toHaveBeenCalledTimes(1);
        expect(sessionService.prototype.deleteSession).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it("should return a 400 when the session-id header is missing", async () => {
        const mockEvent = {
            headers: {},
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toBe("Invalid request: Missing session-id header");
        expect(sessionService.prototype.deleteSession).not.toHaveBeenCalled();
    });

    it("should return a 400 when multiple session-id headers are provided", async () => {
        const mockEvent = {
            headers: { "session-id": TEST_SESSION_ID },
            multiValueHeaders: { "session-id": [TEST_SESSION_ID, "another-session-id"] },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toBe("Unexpected quantity of session-id headers encountered: 2");
        expect(sessionService.prototype.deleteSession).not.toHaveBeenCalled();
    });

    it("should return a 404 when deleting a session that doesn't exist", async () => {
        vi.spyOn(sessionService.prototype, "deleteSession").mockRejectedValue(
            new SessionNotFoundError("does-not-exist", 404),
        );

        const mockEvent = {
            headers: { "session-id": "does-not-exist" },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toBe("Could not find session item with id: does-not-exist");
        expect(sessionService.prototype.deleteSession).toHaveBeenCalledWith("does-not-exist");
    });

    it("should return a 500 when deleting session fails unexpectedly", async () => {
        vi.spyOn(sessionService.prototype, "deleteSession").mockRejectedValue(new Error("DynamoDB unavailable"));

        const mockEvent = {
            headers: { "session-id": TEST_SESSION_ID },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body).message).toBe("Server Error");
    });
});
