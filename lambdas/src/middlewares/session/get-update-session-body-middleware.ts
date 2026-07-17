import { MiddlewareObj, Request } from "@middy/core";
import { SessionItem } from "@govuk-one-login/cri-types";

const getUpdateSessionBodyMiddleWare = (): MiddlewareObj => {
    const before = async (request: Request) => {
        if (typeof request.event.body !== "string") {
            return;
        }

        const body = JSON.parse(request.event.body) as unknown as SessionItem;

        request.event.body = {
            ...(body.clientSessionId && { clientSessionId: body.clientSessionId }),
            ...(body.authorizationCode && { authorizationCode: body.authorizationCode }),
            ...(body.sessionId && { sessionId: body.sessionId }),
        };
    };

    return { before };
};

export default getUpdateSessionBodyMiddleWare;
