export const AUTH_SCORE_WEIGHTS = {
  senderAllowed: 40,
  dkimPass: 15,
  spfPass: 15,
  dmarcPass: 15,
  replyToMismatch: -20,
  suspiciousDomain: -30,
  forwardedOrResent: -15,
} as const;
