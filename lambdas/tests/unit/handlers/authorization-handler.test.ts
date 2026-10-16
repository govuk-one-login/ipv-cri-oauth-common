import middy from "@middy/core";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { beforeEach, describe, expect, it, MockInstance, vi } from "vitest";

import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { AuthorizationLambda } from "../../../src/handlers/authorization-handler";
import { ConfigService } from "../../../src/common/config/config-service";
import { SessionService } from "../../../src/services/session-service";
import { SessionItem, UnixSecondsTimestamp } from "@govuk-one-login/cri-types";
import { APIGatewayProxyEvent, APIGatewayProxyEventHeaders } from "aws-lambda/trigger/api-gateway-proxy";
import {
    InvalidRequestError,
    ServerError,
    SessionNotFoundError,
    AccessDeniedError,
} from "../../../src/common/utils/errors";
import getSessionByIdMiddleware from "../../../src/middlewares/session/get-session-by-id-middleware";
import { CommonConfigKey } from "../../../src/types/config-keys";
import initialiseConfigMiddleware from "../../../src/middlewares/config/initialise-config-middleware";
import errorMiddleware from "../../../src/middlewares/error/error-middleware";
import { Context } from "aws-lambda";
import setGovUkSigningJourneyIdMiddleware from "../../../src/middlewares/session/set-gov-uk-signing-journey-id-middleware";
import setRequestedVerificationScoreMiddleware from "../../../src/middlewares/session/set-requested-verification-score-middleware";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { logger } from "@govuk-one-login/cri-logger";
import { captureMetric } from "@govuk-one-login/cri-metrics";

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

const AUTHORIZATION_SENT_METRIC = "authorization_sent";

describe("authorization-handler.ts", () => {
    const mockDynamoDbClient = vi.mocked(DynamoDBDocument);
    const metricsSpy = vi.mocked(captureMetric);
    const configService = new ConfigService(vi.fn() as unknown as SSMProvider);
    const sessionService = new SessionService(mockDynamoDbClient.prototype, configService);

    const sessionItem: Partial<SessionItem> = {
        sessionId: "abc",
        authorizationCodeExpiryDate: 1 as UnixSecondsTimestamp,
        clientId: "1",
        clientSessionId: "1",
        redirectUri: "http://123.com",
        state: "session-state-value",
        accessToken: "",
        accessTokenExpiryDate: 0 as UnixSecondsTimestamp,
        authorizationCode: "abc",
    };

    const buildLambdaHandler = () => {
        const handlerClass = new AuthorizationLambda();
        return middy(handlerClass.handler.bind(handlerClass))
            .use(
                errorMiddleware(logger, {
                    metric_name: AUTHORIZATION_SENT_METRIC,
                    message: "Authorization Lambda error occurred",
                }),
            )
            .use(injectLambdaContext(logger, { clearState: true }))
            .use(
                initialiseConfigMiddleware({
                    configService: configService,
                    config_keys: [CommonConfigKey.SESSION_TABLE_NAME],
                }),
            )
            .use(getSessionByIdMiddleware({ sessionService: sessionService }))
            .use(setGovUkSigningJourneyIdMiddleware(logger))
            .use(setRequestedVerificationScoreMiddleware(logger));
    };

    let headers = {};
    let lambdaHandler: middy.MiddyfiedHandler;

    beforeEach(() => {
        vi.resetAllMocks();
        const impl = () => vi.fn().mockImplementation(() => Promise.resolve({ Parameters: [] }));
        mockDynamoDbClient.prototype.send = impl();
        mockDynamoDbClient.prototype.query = impl();
        configService.init = () => Promise.resolve();
        vi.spyOn(sessionService, "getSession").mockResolvedValue(sessionItem as SessionItem);

        headers = {
            "session-id": "1",
        } as APIGatewayProxyEventHeaders;
        lambdaHandler = buildLambdaHandler();
    });

    it("should pass with 200 status code and return non empty body", async () => {
        const loggerSpyAppendkeys = vi.spyOn(logger, "appendKeys");
        const loggerSpyInfo = vi.spyOn(logger, "info");

        const output = await lambdaHandler(
            {
                headers,
            } as unknown as APIGatewayProxyEvent,
            {} as Context,
        );

        expect(output.statusCode).toBe(200);
        const response = JSON.parse(output.body);
        expect(response.state.value).toBe("session-state-value");
        expect(response.redirectionURI).toBe("http://123.com");
        expect(response.authorizationCode.value).toBe("abc");
        expect(metricsSpy).toHaveBeenCalledWith("authorization_sent");
        expect(output.body).not.toBeNull();
        expect(loggerSpyInfo).toHaveBeenCalledWith("Session found");
        expect(loggerSpyAppendkeys).toHaveBeenCalledWith({ govuk_signin_journey_id: "1" });
    });

    describe("authorization request returns access_denied", () => {
        let loggerSpyError: MockInstance;
        beforeEach(() => {
            loggerSpyError = vi.spyOn(logger, "error");
        });

        it("returns 403 access_denied when authorizationCode is undefined", async () => {
            vi.spyOn(sessionService, "getSession").mockResolvedValueOnce({
                ...sessionItem,
                authorizationCode: undefined,
            } as SessionItem);
            const result = await lambdaHandler(
                {
                    headers: headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );

            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({
                    message: "Authorization permission denied",
                    code: "access_denied",
                    errorSummary: "access_denied: Authorization permission denied",
                    redirectionUri: "http://123.com",
                    state: "session-state-value",
                }),
            });
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: access_denied: Authorization permission denied",
                expect.any(AccessDeniedError),
            );
            expect(metricsSpy).toHaveBeenCalledWith("no_authorization_code");
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });

        it("uses sessionData.errorDescription=record_unavailable when set", async () => {
            vi.spyOn(sessionService, "getSession").mockResolvedValueOnce({
                ...sessionItem,
                authorizationCode: undefined,
                sessionData: { errorDescription: "record_unavailable" },
            } as SessionItem);

            const result = await lambdaHandler(
                {
                    headers: headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );

            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({
                    message: "record_unavailable",
                    code: "access_denied",
                    errorSummary: "access_denied: record_unavailable",
                    redirectionUri: "http://123.com",
                    state: "session-state-value",
                }),
            });
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: access_denied: record_unavailable",
                expect.any(AccessDeniedError),
            );
            expect(metricsSpy).toHaveBeenCalledWith("no_authorization_code");
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });

        it("uses sessionData.errorDescription=record_update_requested when set", async () => {
            vi.spyOn(sessionService, "getSession").mockResolvedValueOnce({
                ...sessionItem,
                authorizationCode: undefined,
                sessionData: { errorDescription: "record_update_requested" },
            } as SessionItem);

            const result = await lambdaHandler(
                {
                    headers: headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );

            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({
                    message: "record_update_requested",
                    code: "access_denied",
                    errorSummary: "access_denied: record_update_requested",
                    redirectionUri: "http://123.com",
                    state: "session-state-value",
                }),
            });
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: access_denied: record_update_requested",
                expect.any(AccessDeniedError),
            );
            expect(metricsSpy).toHaveBeenCalledWith("no_authorization_code");
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });

        it("returns default message when errorDescription is an empty string", async () => {
            vi.spyOn(sessionService, "getSession").mockResolvedValueOnce({
                ...sessionItem,
                authorizationCode: undefined,
                sessionData: { errorDescription: "" },
            } as SessionItem);

            const result = await lambdaHandler(
                {
                    headers: headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );

            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({
                    message: "Authorization permission denied",
                    code: "access_denied",
                    errorSummary: "access_denied: Authorization permission denied",
                    redirectionUri: "http://123.com",
                    state: "session-state-value",
                }),
            });
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: access_denied: Authorization permission denied",
                expect.any(AccessDeniedError),
            );
            expect(metricsSpy).toHaveBeenCalledWith("no_authorization_code");
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });
    });

    describe("has session present", () => {
        it("should fail when there is no session-id in the authorization request header", async () => {
            const loggerSpyError = vi.spyOn(logger, "error");
            const output = await lambdaHandler({} as unknown as APIGatewayProxyEvent, {} as Context);
            expect(output.statusCode).toBe(400);
            expect(output.body).toContain("Invalid request: Missing session-id header");
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: Invalid request: Missing session-id header",
                expect.any(InvalidRequestError),
            );
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });
        it("should fail when no existing session is found for the current request", async () => {
            const loggerSpyError = vi.spyOn(logger, "error");
            const sessionId = "1";
            const sessionNotFound = new SessionNotFoundError(sessionId);
            vi.spyOn(sessionService, "getSession").mockRejectedValueOnce(sessionNotFound);

            const output = await lambdaHandler(
                {
                    headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );
            expect(output.statusCode).toBe(400);
            expect(output.body).toContain(`Could not find session item with id: ${sessionId}`);
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: 1029: Could not find session item with id: 1",
                sessionNotFound,
            );
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });

        it("should fail when a server error occurs", async () => {
            const loggerSpyError = vi.spyOn(logger, "error");
            const serverError = new ServerError();
            vi.spyOn(sessionService, "getSession").mockRejectedValueOnce(serverError);

            const output = await lambdaHandler(
                {
                    headers,
                } as unknown as APIGatewayProxyEvent,
                {} as Context,
            );
            expect(output.statusCode).toBe(500);
            expect(output.body).toContain("Server error");
            expect(loggerSpyError).toHaveBeenCalledWith(
                "Authorization Lambda error occurred: Server error",
                serverError,
            );
            expect(metricsSpy).toHaveBeenCalledWith("authorization_sent", 0);
        });
    });
});
