import { AwsClientType, createClient } from "../common/aws-client-factory";
import { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { logger } from "@govuk-one-login/cri-logger";
import { ConfigService } from "../common/config/config-service";
import { metrics } from "@govuk-one-login/cri-metrics";
import { APIGatewayProxyEvent } from "aws-lambda";
import middy from "@middy/core";
import errorMiddleware from "../middlewares/error/error-middleware";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import initialiseConfigMiddleware from "../middlewares/config/initialise-config-middleware";
import { CommonConfigKey } from "../types/config-keys";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { SessionService } from "../services/session-service";
import { getSessionId } from "../common/utils/request-utils";

const dynamoDbClient = createClient(AwsClientType.DYNAMO);
const configService = new ConfigService(new SSMProvider({ awsSdkV3Client: createClient(AwsClientType.SSM) }));
const DELETE_SESSION_METRIC = "session_deleted";

export class DeleteSessionLambda implements LambdaInterface {
    constructor(private readonly sessionService: SessionService) {}

    @metrics.logMetrics({ throwOnEmptyMetrics: false, captureColdStartMetric: true })
    public async handler(event: APIGatewayProxyEvent, _context: unknown) {
        logger.info(`DeleteSession lambda triggered`, { event: event });
        const sessionId = getSessionId(event);

        await this.sessionService.deleteSession(sessionId);
        return {
            statusCode: 200,
        };
    }
}

const handlerClass = new DeleteSessionLambda(new SessionService(dynamoDbClient, configService));

export const lambdaHandler = middy(handlerClass.handler.bind(handlerClass))
    .use(
        errorMiddleware(logger, {
            metric_name: DELETE_SESSION_METRIC,
            message: "DeleteSessionFn Lambda error occurred",
        }),
    )
    .use(
        initialiseConfigMiddleware({
            configService: configService,
            config_keys: [
                CommonConfigKey.SESSION_TABLE_NAME,
                CommonConfigKey.SESSION_TTL,
                CommonConfigKey.PERSON_IDENTITY_TABLE_NAME,
            ],
        }),
    )
    .use(injectLambdaContext(logger, { resetKeys: true }));
