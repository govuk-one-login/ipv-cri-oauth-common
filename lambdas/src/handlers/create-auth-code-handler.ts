import { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from "@govuk-one-login/cri-logger";
import { captureMetric, metrics } from "@govuk-one-login/cri-metrics";
import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AwsClientType, createClient } from "../common/aws-client-factory";
import { ConfigService } from "../common/config/config-service";
import { errorPayload } from "../common/utils/errors";
import { generateAuthCode, getSessionId } from "../common/utils/request-utils";
import { msToSeconds } from "../common/utils/time-utils";
import initialiseConfigMiddleware from "../middlewares/config/initialise-config-middleware";
import errorMiddleware from "../middlewares/error/error-middleware";
import { CommonConfigKey } from "../types/config-keys";

const dynamoDbClient = createClient(AwsClientType.DYNAMO);
const ssmClient = createClient(AwsClientType.SSM);
const AUTH_CODE_CREATED_METRIC = "auth_code_created";

export class CreateAuthCodeLambda implements LambdaInterface {
    constructor(
        private readonly configService: ConfigService,
        private readonly dynamoDbClient: DynamoDBDocument,
    ) {}

    @metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
    public async handler(
        event: APIGatewayProxyEvent,
        _context: unknown,
    ): Promise<APIGatewayProxyResult | { statusCode: number }> {
        let sessionId: string = "unknown";
        try {
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

            metrics.addDimension("state", "CREATED");
            captureMetric(AUTH_CODE_CREATED_METRIC);

            logger.info(`AuthCode Created for session`, { sessionId });
            return { statusCode: 201 };
        } catch (err: unknown) {
            if (err instanceof ConditionalCheckFailedException) {
                logger.info(`AuthCode already exists for session`, { sessionId });
                metrics.addDimension("state", "UNCHANGED");
                captureMetric(AUTH_CODE_CREATED_METRIC);
                return { statusCode: 200 };
            }
            return errorPayload(err as Error, logger, "Create AuthCode Lambda error occurred");
        }
    }
}

const configService = new ConfigService(new SSMProvider({ awsSdkV3Client: ssmClient }));

const handlerClass = new CreateAuthCodeLambda(configService, dynamoDbClient);
export const lambdaHandler = middy(handlerClass.handler.bind(handlerClass))
    .use(
        errorMiddleware(logger, {
            metric_name: AUTH_CODE_CREATED_METRIC,
            message: "Create Auth Code error occurred",
        }),
    )
    .use(injectLambdaContext(logger, { clearState: true }))
    .use(
        initialiseConfigMiddleware({
            configService: configService,
            config_keys: [CommonConfigKey.SESSION_TABLE_NAME],
        }),
    );
