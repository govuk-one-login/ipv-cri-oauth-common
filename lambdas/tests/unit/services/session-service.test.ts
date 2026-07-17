import { SessionService } from "../../../src/services/session-service";
import { ConfigService } from "../../../src/common/config/config-service";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { InvalidAccessTokenError, SessionNotFoundError } from "../../../src/common/utils/errors";
import { SessionItem, UnixMillisecondsTimestamp, UnixSecondsTimestamp } from "@govuk-one-login/cri-types";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConditionalCheckFailedException, TableNotFoundException } from "@aws-sdk/client-dynamodb";

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
    });

    describe("updateSession", () => {
        const mockUpdateSessionRequest: SessionItem = {
            sessionId: "00000000-0000-0000-0000-000000000001",
            attemptCount: 0,
            clientId: "test-jwt-client-id",
            clientSessionId: "test-journey-id",
            createdDate: Date.now() as UnixMillisecondsTimestamp,
            expiryDate: Math.floor(Date.now() / 1000) as UnixSecondsTimestamp,
            redirectUri: "test-redirect-uri",
            state: "test-state",
            subject: "test-sub",
        };

        const expectedEpoch = (Date.now() / 1000 + 60) as UnixSecondsTimestamp;

        beforeEach(() => {
            vi.spyOn(configService, "getConfigEntry").mockReturnValue("session-table-name");
            vi.spyOn(configService, "getAuthorizationCodeExpirationEpoch").mockReturnValue(expectedEpoch);
        });

        it("should not call dynamodb if their no authorization code", async () => {
            await sessionService.updateSession(mockUpdateSessionRequest);
            expect(mockDynamoDbClient.prototype.send).not.toHaveBeenCalled();
        });

        it("should call dynamodb if their is an authorization code", async () => {
            await sessionService.updateSession({ ...mockUpdateSessionRequest, authorizationCode: "auth-code" });

            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                        Key: { sessionId: "00000000-0000-0000-0000-000000000001" },
                        ExpressionAttributeValues: {
                            ":authCode": "auth-code",
                            ":authCodeExpiry": expectedEpoch,
                        },
                    }),
                }),
            );
        });

        it("should absorb ConditionalCheckFailedException", async () => {
            vi.spyOn(mockDynamoDbClient.prototype, "send").mockThrow(
                new ConditionalCheckFailedException({
                    $metadata: {},
                    message: "ConditionalCheckFailedException",
                }),
            );

            await expect(
                async () =>
                    await sessionService.updateSession({ ...mockUpdateSessionRequest, authorizationCode: "auth-code" }),
            ).not.toThrow();

            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                        Key: { sessionId: "00000000-0000-0000-0000-000000000001" },
                        ExpressionAttributeValues: {
                            ":authCode": "auth-code",
                            ":authCodeExpiry": expectedEpoch,
                        },
                    }),
                }),
            );
        });

        it("should throw any other exceptions", async () => {
            vi.spyOn(mockDynamoDbClient.prototype, "send").mockThrow(
                new TableNotFoundException({
                    $metadata: {},
                    message: "TableNotFoundException",
                }),
            );

            await expect(
                async () =>
                    await sessionService.updateSession({ ...mockUpdateSessionRequest, authorizationCode: "auth-code" }),
            ).rejects.toThrow(TableNotFoundException);

            expect(mockDynamoDbClient.prototype.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        TableName: "session-table-name",
                        Key: { sessionId: "00000000-0000-0000-0000-000000000001" },
                        ExpressionAttributeValues: {
                            ":authCode": "auth-code",
                            ":authCodeExpiry": expectedEpoch,
                        },
                    }),
                }),
            );
        });
    });
});
