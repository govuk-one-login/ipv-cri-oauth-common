import { describe, expect, it } from "vitest";
import getUpdateSessionBodyMiddleWare from "../../../../src/middlewares/session/get-update-session-body-middleware";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { Request } from "@middy/core";

describe("getUpdateSessionBodyMiddleWare", () => {
    it("should return a middleware with a before", () => {
        const middleware = getUpdateSessionBodyMiddleWare();

        expect(middleware).toBeDefined();
        expect(middleware.before).toBeTypeOf("function");
        expect(middleware.after).toBeUndefined();
        expect(middleware.onError).toBeUndefined();
    });

    it("should do nothing if the body is null", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: null,
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toBeNull();
    });

    it("should do nothing if the body is not a string", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: { parsed: "Test value " },
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toStrictEqual({ parsed: "Test value " });
    });

    it("should return the clientSessionId if this is present", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: '{"clientSessionId":"1234567890"}',
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toStrictEqual({ clientSessionId: "1234567890" });
    });

    it("should return the authorizationCode if this is present", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: '{"authorizationCode":"ABCDEFG"}',
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toStrictEqual({ authorizationCode: "ABCDEFG" });
    });

    it("should return the sessionId if this is present", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: '{"sessionId":"9C3A010E-11C8-48F6-BB9C-82C664A53AA3"}',
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toStrictEqual({
            sessionId: "9C3A010E-11C8-48F6-BB9C-82C664A53AA3",
        });
    });

    it("should return only the required fields", () => {
        const middleware = getUpdateSessionBodyMiddleWare();
        const request = createMiddlewareRequest({
            body: JSON.stringify({
                sessionId: "9C3A010E-11C8-48F6-BB9C-82C664A53AA3",
                authorizationCode: "ABCDEFG",
                clientSessionId: "1234567890",
                otherField: "Test value",
            }),
        } as never as APIGatewayProxyEvent);

        middleware.before?.(request);

        expect(request.event.body).toStrictEqual({
            sessionId: "9C3A010E-11C8-48F6-BB9C-82C664A53AA3",
            authorizationCode: "ABCDEFG",
            clientSessionId: "1234567890",
        });
    });
});

const createMiddlewareRequest = <TEvent>(event: TEvent): Request<TEvent, unknown, Error, Context> => ({
    event,
    context: {} as unknown as Context,
    response: null,
    error: null,
    internal: {},
});
