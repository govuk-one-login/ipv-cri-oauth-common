import { SessionService } from "../../../src/services/session-service";
import { ConfigService } from "../../../src/common/config/config-service";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { InvalidAccessTokenError, SessionNotFoundError } from "../../../src/common/utils/errors";
import { SessionItem, UnixSecondsTimestamp } from "@govuk-one-login/cri-types";
import { Vtr } from "../../../src/schemas/ipv-request.schema";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@govuk-one-login/cri-logger";

const UUID_REGEX = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);

vi.mock("../../../src/common/config/config-service");

describe("session-service", () => {
    let sessionService: SessionService;

    const configService = new ConfigService(vi.fn() as unknown as SSMProvider);
    // let mockDynamoDbClient: MockedObject<typeof DynamoDBDocument>;
    const mockDynamoDbClient = vi.mocked(DynamoDBDocument);
    const mockConfigService = vi.mocked(ConfigService);
    // const mockGetCommand = vi.mocked(GetCommand);
    // const mockUpdateCommand = vi.mocked(UpdateCommand);

    beforeEach(() => {
        vi.resetAllMocks();
        sessionService = new SessionService(mockDynamoDbClient.prototype, configService);
        const impl = () => {
            const mockPromise = new Promise<unknown>((resolve) => {
                resolve({ Parameters: [] });
            });
            return vi.fn().mockImplementation(() => {
                return mockPromise;
            });
        };
        mockDynamoDbClient.prototype.send = impl();
        mockDynamoDbClient.prototype.query = impl();
    });

    describe("getSession", () => {
        it("Should return session item", async () => {
            const tableName = "sessionTable";
            const sessionVal = "myItem";
            const sessionId = "1";
            vi.spyOn(mockDynamoDbClient.prototype, "send").mockImplementation(async () => {
                return Promise.resolve({
                    Item: sessionVal,
                });
            });
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            const output = await sessionService.getSession(sessionId);
            expect(output).toBe("myItem");
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ TableName: tableName, Key: { sessionId: sessionId } }),
                }),
            );
        });

        it("Should throw session item not found when session not found", async () => {
            expect.assertions(2);
            try {
                const tableName = "sessionTable";
                const sessionId = "1";
                vi.spyOn(mockDynamoDbClient.prototype, "send").mockImplementation(() => {
                    return Promise.resolve({});
                });
                vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
                await sessionService.getSession(sessionId);
            } catch (err) {
                expect(mockDynamoDbClient.prototype.send).toHaveBeenCalled();
                expect(err).toBeInstanceOf(SessionNotFoundError);
            }
        });
    });

    describe("createAuthorizationCode", () => {
        it("should call the update command with the a payload that includes ", async () => {
            const tableName = "sessionTable";
            const sessionItem: Partial<SessionItem> = {
                sessionId: "123abc",
                authorizationCodeExpiryDate: 1 as UnixSecondsTimestamp,
                clientId: "",
                clientSessionId: "",
                redirectUri: "",
                accessToken: "",
                accessTokenExpiryDate: 0 as UnixSecondsTimestamp,
            };
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            await sessionService.createAuthorizationCode(sessionItem as SessionItem);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: tableName,
                        ExpressionAttributeValues: {
                            ":authCode": sessionItem.authorizationCode,
                            ":authCodeExpiry": sessionItem.authorizationCodeExpiryDate,
                        },
                    }),
                }),
            );
        });
    });

    describe("getSessionByAuthorizationCode", () => {
        it("should call dynamodb with the authorization code and tablename", async () => {
            const tableName = "sessionTable";
            const authCode = "123";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "query").mockImplementation(() => {
                return Promise.resolve({ Items: ["1"] } as never);
            });
            expect.assertions(3);
            const output = await sessionService.getSessionByAuthorizationCode(authCode);
            expect(mockDynamoDbClient.prototype.query).toHaveBeenCalled();
            expect(mockDynamoDbClient.prototype.query).toHaveBeenCalledWith(
                expect.objectContaining({
                    TableName: tableName,
                    ExpressionAttributeValues: { ":authorizationCode": authCode },
                }),
            );
            expect(output).toBe("1");
        });

        it("should throw an InvalidAccessTokenError on a undefined auth code", async () => {
            const sessionService = new SessionService(mockDynamoDbClient.prototype, configService, "true");

            expect.assertions(1);
            try {
                await sessionService.getSessionByAuthorizationCode(undefined);
            } catch (err) {
                expect(err).toBeInstanceOf(InvalidAccessTokenError);
            }
        });

        it("should log the hashed auth code when ENABLE_EXTRA_AUTH_CODE_LOGGING is true", async () => {
            vi.doMock("@govuk-one-login/cri-logger", () => ({
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
            const sessionService = new SessionService(mockDynamoDbClient.prototype, configService, "true");
            const tableName = "sessionTable";
            const authCode = "123";
            const loggerSpyInfo = vi.spyOn(logger, "info");
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "query").mockImplementation(() => {
                return Promise.resolve({ Items: ["1"] } as never);
            });
            const output = await sessionService.getSessionByAuthorizationCode(authCode);
            expect(output).toBe("1");
            expect(loggerSpyInfo).toHaveBeenCalledWith(
                "Searching for session using auth code: a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                {
                    authCodeHash: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                },
            );
        });

        it("should not log the hashed auth code when ENABLE_EXTRA_AUTH_CODE_LOGGING is false", async () => {
            vi.doMock("@govuk-one-login/cri-logger", () => ({
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
            const sessionService = new SessionService(mockDynamoDbClient.prototype, configService);
            const tableName = "sessionTable";
            const authCode = "123";
            const loggerSpyInfo = vi.spyOn(logger, "info");
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "query").mockImplementation(() => {
                return Promise.resolve({ Items: ["1"] } as never);
            });
            const output = await sessionService.getSessionByAuthorizationCode(authCode);
            expect(output).toBe("1");
            expect(loggerSpyInfo).not.toHaveBeenCalledWith(
                "Searching for session using auth code: a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                {
                    authCodeHash: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                },
            );
        });

        it("should throw a Invalid Access token Error when Session not found", async () => {
            const tableName = "sessionTable";
            const authCode = "123";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "query").mockImplementation(() => {
                return Promise.resolve({} as never);
            });
            expect.assertions(1);
            try {
                await sessionService.getSessionByAuthorizationCode(authCode);
            } catch (err) {
                expect(err).toBeInstanceOf(InvalidAccessTokenError);
            }
        });
    });

    describe("createAccessTokenCode", () => {
        it("should update dynamo db with the access token", async () => {
            const sessionItem = {
                sessionId: "session-id",
                clientId: "client-id",
                clientSessionId: "client-session-id",
                authorizationCodeExpiryDate: 0,
                redirectUri: "redirect-uri",
                accessToken: "access-token",
                accessTokenExpiryDate: 0,
            };
            const accessToken = {
                access_token: "access-token",
                token_type: "token-type",
                expires_in: 0,
            };
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            vi.spyOn(configService, "getBearerAccessTokenExpirationEpoch").mockReturnValueOnce(1675382400000);
            await sessionService.createAccessTokenCodeAndRemoveAuthCode(sessionItem as SessionItem, accessToken);

            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                        Key: { sessionId: "session-id" },
                        UpdateExpression:
                            "SET accessToken=:accessTokenCode, accessTokenExpiryDate=:accessTokenExpiry REMOVE authorizationCode",
                        ExpressionAttributeValues: {
                            ":accessTokenCode": "token-type access-token",
                            ":accessTokenExpiry": 1675382400000,
                        },
                    }),
                }),
            );
        });
    });

    describe("saveSession", () => {
        it("should save the session data to dynamo db", async () => {
            const mockSessionRequestSummary = {
                clientId: "test-jwt-client-id",
                clientIpAddress: "test-client-ip-address",
                clientSessionId: "test-journey-id",
                persistentSessionId: "test-persistent-session-id",
                redirectUri: "test-redirect-uri",
                state: "test-state",
                subject: "test-sub",
            };

            vi.spyOn(global.Date, "now").mockReturnValueOnce(1675382400000);
            vi.spyOn(configService, "getSessionExpirationEpoch").mockReturnValue(1675382500000);
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            const output = await sessionService.saveSession(mockSessionRequestSummary);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                    }),
                }),
            );
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        Item: expect.objectContaining({
                            attemptCount: 0,
                            clientId: "test-jwt-client-id",
                            clientIpAddress: "test-client-ip-address",
                            clientSessionId: "test-journey-id",
                            createdDate: 1675382400000,
                            expiryDate: 1675382500000,
                            persistentSessionId: "test-persistent-session-id",
                            redirectUri: "test-redirect-uri",
                            state: "test-state",
                            subject: "test-sub",
                        }),
                    }),
                }),
            );

            expect(output.sessionId).toEqual(expect.stringMatching(UUID_REGEX));
        });

        it("should save the session data with context to dynamo db", async () => {
            const mockSessionRequestSummary = {
                clientId: "test-jwt-client-id",
                clientIpAddress: "test-client-ip-address",
                clientSessionId: "test-journey-id",
                persistentSessionId: "test-persistent-session-id",
                redirectUri: "test-redirect-uri",
                state: "test-state",
                subject: "test-sub",
                context: "test-context",
            };

            vi.spyOn(global.Date, "now").mockReturnValueOnce(1675382400000);
            vi.spyOn(configService, "getSessionExpirationEpoch").mockReturnValue(1675382500000);
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            const output = await sessionService.saveSession(mockSessionRequestSummary);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                    }),
                }),
            );
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        Item: expect.objectContaining({
                            attemptCount: 0,
                            clientId: "test-jwt-client-id",
                            clientIpAddress: "test-client-ip-address",
                            clientSessionId: "test-journey-id",
                            createdDate: 1675382400000,
                            expiryDate: 1675382500000,
                            persistentSessionId: "test-persistent-session-id",
                            redirectUri: "test-redirect-uri",
                            state: "test-state",
                            subject: "test-sub",
                            context: "test-context",
                        }),
                    }),
                }),
            );

            expect(output.sessionId).toEqual(expect.stringMatching(UUID_REGEX));
        });

        it("should save the session data without clientIpAddress", async () => {
            const mockSessionRequestSummary = {
                clientId: "test-jwt-client-id",
                clientIpAddress: null,
                clientSessionId: "test-journey-id",
                persistentSessionId: "test-persistent-session-id",
                redirectUri: "test-redirect-uri",
                state: "test-state",
                subject: "test-sub",
                context: "test-context",
            };

            vi.spyOn(global.Date, "now").mockReturnValueOnce(1675382400000);
            vi.spyOn(configService, "getSessionExpirationEpoch").mockReturnValue(1675382500000);
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            const output = await sessionService.saveSession(mockSessionRequestSummary);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                    }),
                }),
            );
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        Item: expect.objectContaining({
                            attemptCount: 0,
                            clientId: "test-jwt-client-id",
                            clientSessionId: "test-journey-id",
                            createdDate: 1675382400000,
                            expiryDate: 1675382500000,
                            persistentSessionId: "test-persistent-session-id",
                            redirectUri: "test-redirect-uri",
                            state: "test-state",
                            subject: "test-sub",
                            context: "test-context",
                        }),
                    }),
                }),
            );

            expect(output.sessionId).toEqual(expect.stringMatching(UUID_REGEX));
        });

        it("should save the IPV claims from an IPV request", async () => {
            const mockSessionRequestSummary = {
                clientId: "test-jwt-client-id",
                clientIpAddress: "test-client-ip-address",
                clientSessionId: "test-journey-id",
                persistentSessionId: "test-persistent-session-id",
                redirectUri: "test-redirect-uri",
                state: "test-state",
                subject: "test-sub",
                vtr: ["P2"] as Vtr,
                storageAccessToken: "header.payload.signature",
            };

            vi.spyOn(global.Date, "now").mockReturnValueOnce(1675382400000);
            vi.spyOn(configService, "getSessionExpirationEpoch").mockReturnValue(1675382500000 as UnixSecondsTimestamp);
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            const output = await sessionService.saveSession(mockSessionRequestSummary);

            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        Item: expect.objectContaining({
                            vtr: ["P2"],
                            storageAccessToken: "header.payload.signature",
                        }),
                    }),
                }),
            );

            expect(output.vtr).toEqual(["P2"]);
            expect(output.storageAccessToken).toBe("header.payload.signature");
        });

        it("should leave the IPV claims off the session for a CRI request", async () => {
            const mockSessionRequestSummary = {
                clientId: "test-jwt-client-id",
                clientIpAddress: "test-client-ip-address",
                clientSessionId: "test-journey-id",
                persistentSessionId: "test-persistent-session-id",
                redirectUri: "test-redirect-uri",
                state: "test-state",
                subject: "test-sub",
            };

            vi.spyOn(global.Date, "now").mockReturnValueOnce(1675382400000);
            vi.spyOn(configService, "getSessionExpirationEpoch").mockReturnValue(1675382500000 as UnixSecondsTimestamp);
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            const output = await sessionService.saveSession(mockSessionRequestSummary);

            expect(output.vtr).toBeUndefined();
            expect(output.storageAccessToken).toBeUndefined();
        });
    });

    describe("deleteSession", () => {
        it("should delete the session if the session exists", async () => {
            const tableName = "session-table-name";
            const sessionId = "test-session-id";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "send")
                .mockResolvedValueOnce({ Item: { sessionId } } as never)
                .mockResolvedValueOnce({} as never);

            await sessionService.deleteSession(sessionId);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(2);
            expect(mockDynamoDbClient.prototype.send).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    input: expect.objectContaining({ TableName: tableName, Key: { sessionId } }),
                }),
            );
            expect(mockDynamoDbClient.prototype.send).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    input: expect.objectContaining({ TableName: tableName, Key: { sessionId } }),
                }),
            );
        });

        it("should throw a 404 SessionNotFoundError and not delete the session if the session does not exist", async () => {
            const tableName = "session-table-name";
            const sessionId = "does-not-exist";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "send").mockResolvedValueOnce({} as never);

            expect.assertions(4);
            try {
                await sessionService.deleteSession(sessionId);
            } catch (err) {
                expect(err).toBeInstanceOf(SessionNotFoundError);
                expect((err as SessionNotFoundError).statusCode).toBe(404);
                expect((err as SessionNotFoundError).message).toBe(`Could not find session item with id: ${sessionId}`);
                expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(1);
            }
        });

        it("should propagate a session lookup error without deleting the session", async () => {
            const tableName = "session-table-name";
            const sessionId = "test-session-id";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "send").mockRejectedValueOnce(
                new Error("DynamoDB unavailable") as never,
            );

            expect.assertions(3);
            try {
                await sessionService.deleteSession(sessionId);
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect(err).not.toBeInstanceOf(SessionNotFoundError);
                expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledTimes(1);
            }
        });

        it("should propagate an error thrown by the delete command", async () => {
            const tableName = "session-table-name";
            const sessionId = "test-session-id";
            vi.spyOn(mockConfigService.prototype, "getConfigEntry").mockReturnValue(tableName);
            vi.spyOn(mockDynamoDbClient.prototype, "send")
                .mockResolvedValueOnce({ Item: { sessionId } } as never)
                .mockRejectedValueOnce(new Error("DynamoDB unavailable") as never);

            await expect(sessionService.deleteSession(sessionId)).rejects.toThrow("DynamoDB unavailable");
            expect(mockDynamoDbClient.prototype.send).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    input: expect.objectContaining({ TableName: tableName, Key: { sessionId } }),
                }),
            );
        });
    });
});
