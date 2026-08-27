import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "../../../../src/services/session-service";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import type { Request } from "@middy/core";
import getSessionByAuthCodeMiddleware from "../../../../src/middlewares/session/get-session-by-auth-code-middleware";

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

    const loadMiddleware = async () => {
        const sessionService = {
            getSessionByAuthorizationCode,
        } as unknown as SessionService;

        return getSessionByAuthCodeMiddleware({
            sessionService,
        });
    };

    it("retrieves the session and merges it into the request body", async () => {
        const middleware = await loadMiddleware();

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
});
