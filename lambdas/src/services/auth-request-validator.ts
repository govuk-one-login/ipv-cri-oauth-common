import { APIGatewayProxyEventQueryStringParameters } from "aws-lambda/trigger/api-gateway-proxy";
import { SessionValidationError } from "../common/utils/errors";

export class AuthorizationRequestValidator {
    validate(queryStringParams: APIGatewayProxyEventQueryStringParameters | null, sessionClientId: string) {
        if (!queryStringParams) {
            throw new SessionValidationError("Session Validation Exception", "Missing querystring parameters");
        }

        const clientId = queryStringParams["client_id"];
        const responseType = queryStringParams["response_type"];
        if (!clientId) {
            throw new SessionValidationError("Session Validation Exception", "Missing client_id parameter");
        } else if (!responseType) {
            throw new SessionValidationError("Session Validation Exception", "Missing response_type parameter");
        } else if (clientId !== sessionClientId) {
            throw new SessionValidationError("Session Validation Exception", "Invalid client_id parameter");
        }
    }
}
