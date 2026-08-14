import { buildAuditUser } from "@govuk-one-login/cri-audit";
import { UnixMillisecondsTimestamp, UnixSecondsTimestamp } from "@govuk-one-login/cri-types";
import { describe, expect, it } from "vitest";
import { OAuthSessionItem } from "../../../src/types/oauth-session-item";
import { A_STORAGE_ACCESS_TOKEN } from "../fixtures/storage-access-token";

const aSession = (): OAuthSessionItem => {
    return {
        sessionId: "a-session-id",
        attemptCount: 0,
        clientId: "a-client",
        clientSessionId: "a-journey-id",
        createdDate: 0 as UnixMillisecondsTimestamp,
        expiryDate: 0 as UnixSecondsTimestamp,
        redirectUri: "a-redirect-uri",
        state: "a-state",
        subject: "a-subject",
        clientIpAddress: "1.2.3.4",
        persistentSessionId: "a-persistent-session-id",
        vtr: ["P2"],
        storageAccessToken: A_STORAGE_ACCESS_TOKEN,
    };
};

describe("the audit user built from a session", () => {
    it("does not carry the storage access token", () => {
        expect(JSON.stringify(buildAuditUser(aSession()))).not.toContain(A_STORAGE_ACCESS_TOKEN);
    });

    it("carries only the five fields it names", () => {
        expect(Object.keys(buildAuditUser(aSession())).sort()).toEqual([
            "govuk_signin_journey_id",
            "ip_address",
            "persistent_session_id",
            "session_id",
            "user_id",
        ]);
    });
});
