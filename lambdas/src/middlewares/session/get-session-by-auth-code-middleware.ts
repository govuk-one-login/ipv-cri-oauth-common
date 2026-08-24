import { MiddlewareObj, Request } from "@middy/core";
import { APIGatewayProxyEvent } from "aws-lambda";
import { SessionService } from "../../services/session-service";
import { RequestPayload } from "../../types/request_payload";
import { logger } from "@govuk-one-login/cri-logger";

const defaults = {};

const ATTEMPT_RETRY = process.env.RETRY_SESSION_BY_AUTH_CODE;
const RETRY_DELAY_MS = 1000;

const getSessionByAuthCodeMiddleware = (opts: { sessionService: SessionService }): MiddlewareObj => {
    const options = { ...defaults, ...opts };

    const before = async (request: Request) => {
        const requestPayload = request.event.body as RequestPayload;
        let sessionItem;
        try {
            sessionItem = await options.sessionService.getSessionByAuthorizationCode(requestPayload.code);
        } catch (error) {
            if (ATTEMPT_RETRY !== "true") throw error;

            logger.warn("Error retrieving session by Auth Code, attempting retry ...");
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            sessionItem = await options.sessionService.getSessionByAuthorizationCode(requestPayload.code);
            logger.info("Retry successfully found a session");
        }
        request.event = {
            ...request.event,
            body: {
                ...sessionItem,
                ...requestPayload,
            },
        } as unknown as APIGatewayProxyEvent;
        await request.event;
    };

    return {
        before,
    };
};

export default getSessionByAuthCodeMiddleware;
