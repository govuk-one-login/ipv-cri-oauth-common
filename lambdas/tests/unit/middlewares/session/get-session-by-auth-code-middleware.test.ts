import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "../../../../src/services/session-service";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import type { Request } from "@middy/core";

describe("getSessionByAuthCodeMiddleware", () => {
    const getSessionByAuthorizationCode = vi.fn();

    const requestPayload = {
        code: "auth-code-123",
    };

    const sessionItem = {
        sessionId: "session-123",
        userId: "user-123",
    };

    const createRequest = (): Request => ({
        event: {
            body: requestPayload as unknown as string,
        } as APIGatewayProxyEvent,
        context: {} as Context,
        response: undefined,
        error: null,
        internal: {},
    });
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    const loadMiddleware = async (retryEnabled: boolean) => {
        vi.stubEnv("RETRY_SESSION_BY_AUTH_CODE", retryEnabled ? "true" : "false");

        const { default: getSessionByAuthCodeMiddleware } = await import(
            "../../../../../lambdas/src/middlewares/session/get-session-by-auth-code-middleware"
        );

        const sessionService = {
            getSessionByAuthorizationCode,
        } as unknown as SessionService;

        return getSessionByAuthCodeMiddleware({
            sessionService,
        });
    };

    it("retrieves the session and merges it into the request body", async () => {
        const middleware = await loadMiddleware(false);

        getSessionByAuthorizationCode.mockResolvedValue(sessionItem);

        const request = createRequest();

        await middleware.before!(request);

        expect(getSessionByAuthorizationCode).toHaveBeenCalledOnce();
        expect(getSessionByAuthorizationCode).toHaveBeenCalledWith(requestPayload.code);

        expect(request.event.body).toEqual({
            ...sessionItem,
            ...requestPayload,
        });
    });

    it("throws without retrying when retry is disabled", async () => {
        const middleware = await loadMiddleware(false);

        const error = new Error("DynamoDB error");
        getSessionByAuthorizationCode.mockRejectedValue(error);

        const request = createRequest();

        await expect(middleware.before!(request)).rejects.toThrow(error);

        expect(getSessionByAuthorizationCode).toHaveBeenCalledOnce();
    });

    it("retries after 1 second when retry is enabled", async () => {
        const middleware = await loadMiddleware(true);

        getSessionByAuthorizationCode
            .mockRejectedValueOnce(new Error("DynamoDB error"))
            .mockResolvedValueOnce(sessionItem);

        const request = createRequest();

        const promise = middleware.before!(request);

        expect(getSessionByAuthorizationCode).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(1000);
        await promise;

        expect(getSessionByAuthorizationCode).toHaveBeenCalledTimes(2);
        expect(getSessionByAuthorizationCode).toHaveBeenNthCalledWith(1, requestPayload.code);
        expect(getSessionByAuthorizationCode).toHaveBeenNthCalledWith(2, requestPayload.code);

        expect(request.event.body).toEqual({
            ...sessionItem,
            ...requestPayload,
        });
    });

    it("throws if the retry also fails", async () => {
        const middleware = await loadMiddleware(true);

        const firstError = new Error("First error");
        const secondError = new Error("Second error");

        getSessionByAuthorizationCode.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);

        const request = createRequest();

        const promise = middleware.before!(request);

        const assertion = expect(promise).rejects.toThrow(secondError);

        await vi.advanceTimersByTimeAsync(1000);

        await assertion;

        expect(getSessionByAuthorizationCode).toHaveBeenCalledTimes(2);
    });
});
