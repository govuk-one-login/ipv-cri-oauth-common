import { base64url, decodeJwt, decodeProtectedHeader } from "jose";

const signingAlgorithm = (token: string): unknown => {
    try {
        decodeJwt(token);

        return decodeProtectedHeader(token).alg;
    } catch {
        return undefined;
    }
};

const isSigningAlgorithm = (algorithm: unknown): boolean => {
    if (typeof algorithm !== "string") {
        return false;
    }

    if (algorithm.length === 0) {
        return false;
    }

    return algorithm.toLowerCase() !== "none";
};

const hasSignature = (token: string): boolean => {
    const [, , signature] = token.split(".");

    if (!signature) {
        return false;
    }

    try {
        return base64url.decode(signature).length > 0;
    } catch {
        return false;
    }
};

export const isSignedJwt = (token: string): boolean => {
    if (!hasSignature(token)) {
        return false;
    }

    return isSigningAlgorithm(signingAlgorithm(token));
};
