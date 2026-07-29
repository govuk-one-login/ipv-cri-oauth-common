import { UnixSecondsTimestamp } from "@govuk-one-login/cri-types";

export const msToSeconds = (ms: number): UnixSecondsTimestamp => Math.floor(ms / 1000) as UnixSecondsTimestamp;
