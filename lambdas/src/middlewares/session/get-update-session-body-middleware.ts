import { MiddlewareObj, Request } from "@middy/core";
import { SessionItem } from "@govuk-one-login/cri-types";

const getUpdateSessionBodyMiddleWare = (): MiddlewareObj => {
    const before = async (request: Request) => {
        let body: SessionItem;
        if (typeof request.event.body === "string") {
            body = JSON.parse(request.event.body) as unknown as SessionItem;
        } else if (typeof request.event.body === "object" && request.event.body) {
            body = request.event.body as unknown as SessionItem;
        } else {
            body = {} as unknown as SessionItem;
        }

        request.event.body = {
            clientSessionId: body.clientSessionId,
            ...(body.authorizationCode && { authorizationCode: body.authorizationCode }),
            ...(body.sessionId && { sessionId: body.sessionId }),
        };
    };

    return { before };
};

export default getUpdateSessionBodyMiddleWare;
