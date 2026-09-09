import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "../../../../src/services/session-service";
import type { Request } from "@middy/core";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import getSessionByIdMiddleware from "../../../../src/middlewares/session/get-session-by-id-middleware";

describe("getSessionByIdMiddleware", () => {
    const getSession = vi.fn();
    const validateSessionAndAuthorizationCodeExpiry = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });
    const sessionItem = {
        sessionId: "session-123",
        expiryDate: 9999999999,
        authorizationCodeExpiryDate: 9999999999,
    };

    const loadMiddleware = () => {
        const sessionService = {
            getSession,
            validateSessionAndAuthorizationCodeExpiry,
        } as unknown as SessionService;

        return getSessionByIdMiddleware({
            sessionService,
            validateAuthorizationCodeExpiry: true,
        });
    };

    it("does not validate authorisation code expiry unless requested", async () => {
        const sessionService = {
            getSession,
            validateSessionAndAuthorizationCodeExpiry,
        } as unknown as SessionService;

        const middleware = getSessionByIdMiddleware({
            sessionService,
        });

        getSession.mockResolvedValue(sessionItem);

        const request: Request = {
            event: {
                body: {
                    sessionId: "session-123",
                },
            } as unknown as APIGatewayProxyEvent,
            context: {} as Context,
            response: undefined,
            error: null,
            internal: {},
        };

        await middleware.before!(request);

        expect(getSession).toHaveBeenCalledWith("session-123");
        expect(validateSessionAndAuthorizationCodeExpiry).not.toHaveBeenCalled();
    });
    it("loads the session and validates expiry", async () => {
        const middleware = loadMiddleware();

        getSession.mockResolvedValue(sessionItem);

        const request: Request = {
            event: {
                body: {
                    sessionId: "session-123",
                },
            } as unknown as APIGatewayProxyEvent,
            context: {} as Context,
            response: undefined,
            error: null,
            internal: {},
        };

        await middleware.before!(request);

        expect(getSession).toHaveBeenCalledWith("session-123");

        expect(validateSessionAndAuthorizationCodeExpiry).toHaveBeenCalledWith(sessionItem);
    });
});
