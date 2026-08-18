import { base64url } from "jose";
import { describe, expect, it } from "vitest";
import {
    StorageAccessTokenClaimSchema,
    StorageAccessTokenSchema,
    VtrSchema,
} from "../../../src/schemas/ipv-request.schema";
import { A_STORAGE_ACCESS_TOKEN, aJwt } from "../fixtures/storage-access-token";

const encode = (value: object): string => {
    return base64url.encode(JSON.stringify(value));
};

describe("VtrSchema", () => {
    it.each([[["P1"]], [["P2"]], [["P3"]], [["P4"]], [["P2", "P1"]], [["P1", "P2", "P3", "P4"]]])(
        "accepts %p",
        (vtr) => {
            expect(VtrSchema.safeParse(vtr).success).toBe(true);
        },
    );

    it.each([
        [[], "Too small: expected array to have >=1 items"],
        [["P0"], 'Invalid option: expected one of "P1"|"P2"|"P3"|"P4"'],
        [["P5"], 'Invalid option: expected one of "P1"|"P2"|"P3"|"P4"'],
        [["p2"], 'Invalid option: expected one of "P1"|"P2"|"P3"|"P4"'],
        [[2], 'Invalid option: expected one of "P1"|"P2"|"P3"|"P4"'],
        ["P2", "Invalid input: expected array, received string"],
        [null, "Invalid input: expected array, received null"],
        [{}, "Invalid input: expected array, received object"],
    ])("rejects %p", (vtr, message) => {
        const result = VtrSchema.safeParse(vtr);

        expect(result.success).toBe(false);
        expect(result.error!.issues[0].message).toBe(message);
    });
});

describe("StorageAccessTokenSchema", () => {
    it("accepts a signed JWT", () => {
        expect(StorageAccessTokenSchema.safeParse(A_STORAGE_ACCESS_TOKEN).success).toBe(true);
    });

    it.each([
        ["an empty string", ""],
        ["a token with no signature", `${encode({ alg: "ES256" })}.${encode({ sub: "x" })}.`],
        ["an unsecured token", aJwt({ typ: "JWT", alg: "none" })],
        ["an opaque bearer token", "an-opaque-bearer-token"],
    ])("rejects %s", (_scenario, token) => {
        const result = StorageAccessTokenSchema.safeParse(token);

        expect(result.success).toBe(false);
        expect(result.error!.issues[0].message).toBe("must be a signed JWT");
    });

    it.each([[null], [undefined], [1], [{}], [[]]])("rejects the non-string %p", (token) => {
        expect(StorageAccessTokenSchema.safeParse(token).success).toBe(false);
    });
});

describe("StorageAccessTokenClaimSchema", () => {
    it("accepts a claim holding exactly one token", () => {
        expect(StorageAccessTokenClaimSchema.safeParse({ values: [A_STORAGE_ACCESS_TOKEN] }).success).toBe(true);
    });

    it.each([
        [{ values: [] }, "must contain exactly one storage access token"],
        [{ values: [A_STORAGE_ACCESS_TOKEN, A_STORAGE_ACCESS_TOKEN] }, "must contain exactly one storage access token"],
        [{ essential: true }, "Invalid input: expected array, received undefined"],
        [null, "Invalid input: expected object, received null"],
    ])("rejects %p", (claim, message) => {
        const result = StorageAccessTokenClaimSchema.safeParse(claim);

        expect(result.success).toBe(false);
        expect(result.error!.issues[0].message).toBe(message);
    });

    it("reports the offending token by path", () => {
        const result = StorageAccessTokenClaimSchema.safeParse({ values: ["not-a-jwt"] });

        expect(result.success).toBe(false);
        expect(result.error!.issues[0].path).toEqual(["values", 0]);
    });

    it("never puts the token value into the error message", () => {
        const result = StorageAccessTokenClaimSchema.safeParse({
            values: [A_STORAGE_ACCESS_TOKEN, A_STORAGE_ACCESS_TOKEN],
        });

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error!.issues)).not.toContain(A_STORAGE_ACCESS_TOKEN);
    });
});
