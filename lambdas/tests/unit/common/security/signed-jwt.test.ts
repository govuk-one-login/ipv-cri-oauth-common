import { base64url } from "jose";
import { describe, expect, it } from "vitest";
import { isSignedJwt } from "../../../../src/common/security/signed-jwt";
import { A_STORAGE_ACCESS_TOKEN, aJwt } from "../../fixtures/storage-access-token";

const encode = (value: object): string => {
    return base64url.encode(JSON.stringify(value));
};

describe("isSignedJwt", () => {
    it("accepts a signed JWT", () => {
        expect(isSignedJwt(A_STORAGE_ACCESS_TOKEN)).toBe(true);
    });

    it.each([
        ["an empty string", ""],
        ["an opaque bearer token", "an-opaque-bearer-token"],
        ["a token with no signature", `${encode({ alg: "ES256" })}.${encode({ sub: "x" })}.`],
        ["a token whose signature decodes to nothing", `${encode({ alg: "ES256" })}.${encode({ sub: "x" })}. `],
        ["a token with only two parts", `${encode({ alg: "ES256" })}.${encode({ sub: "x" })}`],
        ["a token with four parts", `${aJwt()}.a-fourth-part`],
        ["an unsecured token", aJwt({ typ: "JWT", alg: "none" })],
        ["an unsecured token with a capitalised alg", aJwt({ typ: "JWT", alg: "None" })],
        ["a token with no alg", aJwt({ typ: "JWT" })],
        ["a token whose alg is empty", aJwt({ typ: "JWT", alg: "" })],
        ["a token whose alg is not a string", aJwt({ typ: "JWT", alg: 256 })],
        ["a token whose signature is not base64url", `${encode({ alg: "ES256" })}.${encode({ sub: "x" })}.!!!`],
        ["a token whose header is not JSON", `not-json.${encode({ sub: "x" })}.a-signature`],
        ["a token whose payload is not JSON", `${encode({ alg: "ES256" })}.not-json.a-signature`],
    ])("rejects %s", (_scenario, token) => {
        expect(isSignedJwt(token)).toBe(false);
    });
});
