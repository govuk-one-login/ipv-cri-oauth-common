import { beforeEach, describe, expect, it } from "vitest";
import { APIGatewayProxyEventQueryStringParameters } from "aws-lambda";
import { AuthorizationRequestValidator } from "../../../src/services/auth-request-validator";

describe("auth-request-validator", () => {
    describe("validate", () => {
        let authRequestValidator: AuthorizationRequestValidator;
        const existingClientId = "a-valid-clientId";
        beforeEach(() => {
            authRequestValidator = new AuthorizationRequestValidator();
        });
        describe("no queryStringParams", () => {
            it("should return missing querystring parameters", () => {
                expect(() => authRequestValidator.validate(null, existingClientId)).toThrow(
                    expect.objectContaining({
                        details: "Missing querystring parameters",
                        message: "Session Validation Exception",
                    }),
                );
            });
        });
        describe("well-formed queryStringParams", () => {
            let queryStringParams: APIGatewayProxyEventQueryStringParameters;
            beforeEach(() => {
                queryStringParams = {
                    client_id: "a-valid-clientId",
                    response_type: "a-valid-response-type",
                };
            });

            describe("with an existing client id", () => {
                it("should be called successfully and not throw any error", () => {
                    expect(() => authRequestValidator.validate(queryStringParams, existingClientId)).not.toThrow();
                });
            });
            describe("with a mismatched client id", () => {
                it("should return invalid client id parameter error", () => {
                    queryStringParams["client_id"] = "an-unexpected-clientId-in-the-request";
                    expect(() => authRequestValidator.validate(queryStringParams, existingClientId)).toThrow(
                        expect.objectContaining({
                            details: "Invalid client_id parameter",
                            message: "Session Validation Exception",
                        }),
                    );
                });
            });
            describe("client id not matching", () => {
                it("first invalid returned i.e. client_id uri parameter error", () => {
                    queryStringParams["client_id"] = "an-invalid-client-id-in-the-request";
                    expect(() => authRequestValidator.validate(queryStringParams, existingClientId)).toThrow(
                        expect.objectContaining({
                            details: "Invalid client_id parameter",
                            message: "Session Validation Exception",
                        }),
                    );
                });
            });
        });
        describe("incomplete queryStringParam", () => {
            describe("missing param attributes", () => {
                let queryStringParams: APIGatewayProxyEventQueryStringParameters;
                beforeEach(() => {
                    queryStringParams = {};
                });
                it("should return missing client id parameter error", () => {
                    queryStringParams["response_type"] = "a-valid-response-type";
                    expect(() => authRequestValidator.validate(queryStringParams, existingClientId)).toThrow(
                        expect.objectContaining({
                            details: "Missing client_id parameter",
                            message: "Session Validation Exception",
                        }),
                    );
                });
                it("should return missing response type parameter error", () => {
                    queryStringParams["client_id"] = "a-valid-clientId";

                    expect(() => authRequestValidator.validate(queryStringParams, existingClientId)).toThrow(
                        expect.objectContaining({
                            details: "Missing response_type parameter",
                            message: "Session Validation Exception",
                        }),
                    );
                });
            });
        });
    });
});
