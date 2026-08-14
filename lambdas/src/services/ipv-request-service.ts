import { JWTPayload } from "jose";
import { StorageAccessTokenClaimSchema } from "../schemas/ipv-request.schema";

export const STORAGE_ACCESS_TOKEN_CLAIM = "https://vocab.account.gov.uk/v1/storageAccessToken";

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
    if (typeof value !== "object") {
        return undefined;
    }

    if (value === null) {
        return undefined;
    }

    return value as Record<string, unknown>;
};

export const getStorageAccessTokenClaim = (payload: JWTPayload): unknown => {
    const claims = asRecord(payload["claims"]);
    const userinfo = asRecord(claims?.["userinfo"]);

    if (!userinfo) {
        return undefined;
    }

    if (!(STORAGE_ACCESS_TOKEN_CLAIM in userinfo)) {
        return undefined;
    }

    return userinfo[STORAGE_ACCESS_TOKEN_CLAIM];
};

export const getStorageAccessToken = (payload: JWTPayload): string | undefined => {
    const claim = StorageAccessTokenClaimSchema.safeParse(getStorageAccessTokenClaim(payload));

    if (!claim.success) {
        return undefined;
    }

    return claim.data.values[0];
};
