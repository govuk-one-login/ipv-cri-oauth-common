import { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import { DynamoDBDocument, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { logger } from "@govuk-one-login/cri-logger";
import { captureMetric, metrics } from "@govuk-one-login/cri-metrics";
import middy from "@middy/core";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AwsClientType, createClient } from "../common/aws-client-factory";
import { ConfigService } from "../common/config/config-service";
import { errorPayload, InvalidPayloadError } from "../common/utils/errors";
import { getSessionId } from "../common/utils/request-utils";
import initialiseConfigMiddleware from "../middlewares/config/initialise-config-middleware";
import errorMiddleware from "../middlewares/error/error-middleware";
import { CommonConfigKey } from "../types/config-keys";

const dynamoDbClient = createClient(AwsClientType.DYNAMO);
const ssmClient = createClient(AwsClientType.SSM);
const SESSION_DATA_UPDATED_METRIC = "session_data_updated";

export class UpdateSessionDataLambda implements LambdaInterface {
    constructor(
        private readonly configService: ConfigService,
        private readonly dynamoDbClient: DynamoDBDocument,
    ) {}

    @metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
    public async handler(event: APIGatewayProxyEvent, _context: unknown): Promise<APIGatewayProxyResult> {
        try {
            logger.info("Update Session Data Lambda triggered");

            const sessionId = getSessionId(event);
            const sessionData = this.parseBody(event.body);
            const tableName = this.configService.getConfigEntry(CommonConfigKey.SESSION_TABLE_NAME);

            await this.dynamoDbClient.send(
                new UpdateCommand({
                    TableName: tableName,
                    Key: { sessionId: sessionId },
                    UpdateExpression: "SET #sessionData = if_not_exists(#sessionData, :emptyMap)",
                    ConditionExpression: "attribute_exists(sessionId)",
                    ExpressionAttributeNames: { "#sessionData": "sessionData" },
                    ExpressionAttributeValues: { ":emptyMap": {} },
                }),
            );

            const { updateExpression, expressionAttributeNames, expressionAttributeValues } =
                this.buildUpdateExpression(sessionData);

            await this.dynamoDbClient.send(
                new UpdateCommand({
                    TableName: tableName,
                    Key: { sessionId: sessionId },
                    UpdateExpression: updateExpression,
                    ConditionExpression: "attribute_exists(sessionId)",
                    ExpressionAttributeNames: expressionAttributeNames,
                    ExpressionAttributeValues:
                        Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
                }),
            );

            captureMetric(SESSION_DATA_UPDATED_METRIC);
            logger.info("Session data updated", { sessionId });
            return { statusCode: 200, body: "" };
        } catch (err: unknown) {
            return errorPayload(err as Error, logger, "Update Session Data Lambda error occurred");
        }
    }

    private buildUpdateExpression(sessionData: Record<string, unknown>): {
        updateExpression: string;
        expressionAttributeNames: Record<string, string>;
        expressionAttributeValues: Record<string, unknown>;
    } {
        const setClauses: string[] = [];
        const removeClauses: string[] = [];
        const expressionAttributeNames: Record<string, string> = { "#sessionData": "sessionData" };
        const expressionAttributeValues: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(sessionData)) {
            const nameAlias = `#${key}`;
            expressionAttributeNames[nameAlias] = key;

            if (value === null) {
                removeClauses.push(`#sessionData.${nameAlias}`);
            } else {
                const valueAlias = `:${key}`;
                setClauses.push(`#sessionData.${nameAlias} = ${valueAlias}`);
                expressionAttributeValues[valueAlias] = value;
            }
        }

        const expressionParts: string[] = [];
        if (setClauses.length > 0) {
            expressionParts.push(`SET ${setClauses.join(", ")}`);
        }
        if (removeClauses.length > 0) {
            expressionParts.push(`REMOVE ${removeClauses.join(", ")}`);
        }

        if (expressionParts.length === 0) {
            throw new InvalidPayloadError("Request body must contain at least one property to update");
        }

        return {
            updateExpression: expressionParts.join(" "),
            expressionAttributeNames,
            expressionAttributeValues,
        };
    }

    private parseBody(body: string | null): Record<string, unknown> {
        if (!body) {
            throw new InvalidPayloadError("Missing request body");
        }

        try {
            const parsedJsonBody = JSON.parse(body);
            if (typeof parsedJsonBody !== "object" || parsedJsonBody === null || Array.isArray(parsedJsonBody)) {
                throw new InvalidPayloadError("Request body must be a JSON object");
            }
            return parsedJsonBody as Record<string, unknown>;
        } catch (error) {
            if (error instanceof InvalidPayloadError) {
                throw error;
            }
            throw new InvalidPayloadError("Request body must be valid JSON");
        }
    }
}

const configService = new ConfigService(new SSMProvider({ awsSdkV3Client: ssmClient }));
const handlerClass = new UpdateSessionDataLambda(configService, dynamoDbClient);
export const lambdaHandler = middy(handlerClass.handler.bind(handlerClass))
    .use(
        errorMiddleware(logger, {
            metric_name: SESSION_DATA_UPDATED_METRIC,
            message: "Update Session Data error occurred",
        }),
    )
    .use(injectLambdaContext(logger, { clearState: true }))
    .use(
        initialiseConfigMiddleware({ configService: configService, config_keys: [CommonConfigKey.SESSION_TABLE_NAME] }),
    );
