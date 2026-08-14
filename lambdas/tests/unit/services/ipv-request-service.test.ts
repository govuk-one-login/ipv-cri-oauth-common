import { JWTPayload } from "jose";
import { describe, expect, it } from "vitest";
import {
    getStorageAccessToken,
    getStorageAccessTokenClaim,
    STORAGE_ACCESS_TOKEN_CLAIM,
} from "../../../src/services/ipv-request-service";
import { A_STORAGE_ACCESS_TOKEN, AN_UNSIGNED_TOKEN } from "../fixtures/storage-access-token";

const userinfo = (claim: unknown): JWTPayload => {
    return {
        claims: {
            userinfo: {
                "https://vocab.account.gov.uk/v1/coreIdentityJWT": { essential: true },
                "https://vocab.account.gov.uk/v1/socialSecurityRecord": null,
                [STORAGE_ACCESS_TOKEN_CLAIM]: claim,
            },
        },
    };
};

describe("getStorageAccessTokenClaim", () => {
    it("returns the claim when the JAR asks for it", () => {
        expect(getStorageAccessTokenClaim(userinfo({ values: [A_STORAGE_ACCESS_TOKEN] }))).toEqual({
            values: [A_STORAGE_ACCESS_TOKEN],
        });
    });

    it("distinguishes a null claim from an absent one, so a null fails validation", () => {
        expect(getStorageAccessTokenClaim(userinfo(null))).toBeNull();
    });

    it.each([
        ["there is no claims claim", {}],
        ["claims has no userinfo", { claims: {} }],
        ["userinfo asks for other claims only", { claims: { userinfo: { "…/v1/passport": { essential: true } } } }],
        ["claims is a string", { claims: "openid" }],
        ["claims is a number", { claims: 1 }],
        ["claims is null", { claims: null }],
        ["claims.userinfo is a string", { claims: { userinfo: "openid" } }],
        ["claims.userinfo is a number", { claims: { userinfo: 1 } }],
        ["claims.userinfo is null", { claims: { userinfo: null } }],
    ])("returns undefined when %s", (_scenario, payload) => {
        expect(getStorageAccessTokenClaim(payload)).toBeUndefined();
    });
});

describe("getStorageAccessToken", () => {
    it("unwraps the token out of the values array", () => {
        expect(getStorageAccessToken(userinfo({ values: [A_STORAGE_ACCESS_TOKEN] }))).toBe(A_STORAGE_ACCESS_TOKEN);
    });

    it.each([
        ["the claim is absent", {}],
        ["the claim is null", userinfo(null)],
        ["the claim has no values", userinfo({ essential: true })],
        ["the values array is empty", userinfo({ values: [] })],
        ["there is more than one token", userinfo({ values: [A_STORAGE_ACCESS_TOKEN, A_STORAGE_ACCESS_TOKEN] })],
        ["the token is not a signed JWT", userinfo({ values: [AN_UNSIGNED_TOKEN] })],
        ["claims.userinfo is a string", { claims: { userinfo: "openid" } }],
    ])("returns undefined when %s", (_scenario, payload) => {
        expect(getStorageAccessToken(payload)).toBeUndefined();
    });
});
