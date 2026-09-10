import { MiddlewareObj, Request } from "@middy/core";
import { SessionService } from "../../services/session-service";
import { getSessionId } from "../../common/utils/request-utils";

type GetSessionByIdMiddlewareOptions = {
    sessionService: SessionService;
    validateAuthorizationCodeExpiry?: boolean;
};

const getSessionByIdMiddleware = (options: GetSessionByIdMiddlewareOptions): MiddlewareObj => {
    const before = async (request: Request) => {
        const event = request.event;
        const sessionId = event?.body?.sessionId || getSessionId(event);
        const sessionItem = await options.sessionService.getSession(sessionId);

        if (options.validateAuthorizationCodeExpiry) {
            options.sessionService.validateSessionAndAuthorizationCodeExpiry(sessionItem);
        }
        request.event = {
            ...request.event,
            body: {
                ...sessionItem,
                ...event.body,
            },
        };
    };

    return {
        before,
    };
};

export default getSessionByIdMiddleware;
