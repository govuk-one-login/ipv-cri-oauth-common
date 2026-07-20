import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { LambdaInterface } from "@aws-lambda-powertools/commons/types";
import { AwsClientType, createClient } from "../common/aws-client-factory";
import { ConfigService } from "../common/config/config-service";
import middy from "@middy/core";
import errorMiddleware from "../middlewares/error/error-middleware";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import setGovUkSigningJourneyIdMiddleware from "../middlewares/session/set-gov-uk-signing-journey-id-middleware";
import { SessionService } from "../services/session-service";
import { logger } from "@govuk-one-login/cri-logger";
import { SSMProvider } from "@aws-lambda-powertools/parameters/ssm";
import initialiseConfigMiddleware from "../middlewares/config/initialise-config-middleware";
import { CommonConfigKey } from "../types/config-keys";
import getUpdateSessionBodyMiddleWare from "../middlewares/session/get-update-session-body-middleware";
import { SessionItem } from "@govuk-one-login/cri-types";
import { getSessionId } from "../common/utils/request-utils";

const dynamoDbClient = createClient(AwsClientType.DYNAMO);
const UPDATE_SESSION_METRIC = "session_updated";

export class UpdatedSessionLambda implements LambdaInterface {
    constructor(
        private readonly configService: ConfigService,
        private readonly dynamoDbClient: DynamoDBDocument,
        private readonly sessionService: SessionService,
    ) {}

    public async handler(
        event: APIGatewayProxyEvent,
        _context: unknown,
    ): Promise<APIGatewayProxyResult | { statusCode: number }> {
        const sessionItem = event.body as unknown as SessionItem;

        sessionItem.sessionId ??= getSessionId(event);
        this.sessionService.updateSession(sessionItem);

        return { statusCode: 204 };
    }
}

const ssmClient = createClient(AwsClientType.SSM);
const configService = new ConfigService(new SSMProvider({ awsSdkV3Client: ssmClient }));
const sessionService = new SessionService(dynamoDbClient, configService);
const handlerClass = new UpdatedSessionLambda(configService, dynamoDbClient, sessionService);

export const lambdaHandler = middy(handlerClass.handler.bind(handlerClass))
    .use(
        errorMiddleware(logger, {
            metric_name: UPDATE_SESSION_METRIC,
            message: "Update Session Lambda error occurred",
        }),
    )
    .use(injectLambdaContext(logger, { clearState: true }))
    .use(
        initialiseConfigMiddleware({
            configService: configService,
            config_keys: [CommonConfigKey.SESSION_TABLE_NAME],
        }),
    )
    .use(getUpdateSessionBodyMiddleWare())
    .use(setGovUkSigningJourneyIdMiddleware(logger));
