import { z } from "zod";
import { isSignedJwt } from "../common/security/signed-jwt";

const LEVELS_OF_CONFIDENCE = ["P1", "P2", "P3", "P4"] as const;

export const VtrSchema = z.array(z.enum(LEVELS_OF_CONFIDENCE)).min(1).describe("Levels of confidence");

export type Vtr = z.infer<typeof VtrSchema>;

export const StorageAccessTokenSchema = z
    .string()
    .refine(isSignedJwt, "must be a signed JWT")
    .describe("Storage access token");

export const StorageAccessTokenClaimSchema = z
    .object({
        values: z.array(StorageAccessTokenSchema).length(1, "must contain exactly one storage access token"),
    })
    .describe("The storage access token entry inside the claims");
