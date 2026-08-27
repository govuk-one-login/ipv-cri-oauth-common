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
    // let sessionService: SessionService;
    let configService: ConfigService;
    let mockDynamoDbClient: MockedObject<typeof DynamoDBDocument>;

    beforeEach(() => {
        vi.clearAllMocks();

        configService = new ConfigService(vi.fn() as unknown as SSMProvider);
        mockDynamoDbClient = vi.mocked(DynamoDBDocument);
        mockDynamoDbClient.prototype.send = vi.fn().mockResolvedValue({});

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
        const mockEvent = {
            headers: { "session-id": TEST_SESSION_ID },
        } as unknown as APIGatewayProxyEvent;

        const result = await lambdaHandler(mockEvent, {} as Context);
        expect(result.statusCode).toBe(200);
    });
});
