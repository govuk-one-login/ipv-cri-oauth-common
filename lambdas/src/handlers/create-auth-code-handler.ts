import { DynamoDBDocument, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { AwsClientType, createClient } from "../common/aws-client-factory";
import { ConfigService } from "../common/config/config-service";
import { generateAuthCode, getSessionId } from "../common/utils/request-utils";
import { CommonConfigKey } from "../types/config-keys";
import { Logger } from "@aws-lambda-powertools/logger";
import { errorPayload } from "../common/utils/errors";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { msToSeconds } from "../common/utils/time-utils";

const dynamoDbClient = createClient(AwsClientType.DYNAMO);
const ssmClient = createClient(AwsClientType.SSM);
const logger = new Logger();
const configService = new ConfigService(new SSMProvider({ awsSdkV3Client: ssmClient }));
const initPromise = configService.init([CommonConfigKey.SESSION_TABLE_NAME]);

export class CreateAuthCodeLambda implements LambdaInterface {
    constructor(
        private readonly configService: ConfigService,
        private readonly dynamoDbClient: DynamoDBDocument,
    ) {}

    @logger.injectLambdaContext({ clearState: true })
    public async handler(
        event: APIGatewayProxyEvent,
        _context: unknown,
    ): Promise<APIGatewayProxyResult | { statusCode: number }> {
        let sessionId: string = "unknown";
        try {
            await initPromise;
            logger.info("Create AuthCode Lambda triggered");

            const authorizationCode = generateAuthCode();
            sessionId = getSessionId(event);

            await this.dynamoDbClient.send(
                new UpdateCommand({
                    TableName: this.configService.getConfigEntry(CommonConfigKey.SESSION_TABLE_NAME),
                    Key: { sessionId: sessionId },
                    UpdateExpression: "SET authorizationCode=:authCode, authorizationCodeExpiryDate=:authCodeExpiry",
                    ConditionExpression:
                        "attribute_not_exists(authorizationCode) OR authorizationCodeExpiryDate < :now",
                    ExpressionAttributeValues: {
                        ":authCode": authorizationCode,
                        ":authCodeExpiry": this.configService.getAuthorizationCodeExpirationEpoch(),
                        ":now": msToSeconds(Date.now()),
                    },
                }),
            );
            logger.info(`AuthCode Created on Session with Id: ${sessionId}`);
            return { statusCode: 201 };
        } catch (err: unknown) {
            if (err instanceof ConditionalCheckFailedException) {
                logger.info(`AuthCode already exists for Session with Id: ${sessionId}`);
                return { statusCode: 200 };
            }
            return errorPayload(err as Error, logger, "Create AuthCode Lambda error occurred");
        }
    }
}

const handlerClass = new CreateAuthCodeLambda(configService, dynamoDbClient);
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
