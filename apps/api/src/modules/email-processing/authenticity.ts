import type { AllowedBankSender } from '@prisma/client';
import type { AuthEvaluationResult, SenderMatchType } from '@ledgerlink/shared';

import { AUTH_SCORE_WEIGHTS } from './auth-config';
import { extractDomain, extractEmailAddress, isPublicMailboxDomain } from './helpers';
import type { NormalizedInboundEmail } from './types';

function resolveAuthStatus(score: number, hasKnownSignal: boolean): AuthEvaluationResult['authStatus'] {
  if (!hasKnownSignal) {
    return 'unknown';
  }
  if (score >= 80) {
    return 'high';
  }
  if (score >= 55) {
    return 'medium';
  }
  return 'low';
}

interface SenderClassification {
  senderMatchType: SenderMatchType;
  exactSenderAllowed: boolean;
  domainSenderAllowed: boolean;
  fromAddress: string | null;
  fromDomain: string | null;
}

export function classifyAllowedSender(
  email: Pick<NormalizedInboundEmail, 'fromAddress'>,
  allowedSenders: AllowedBankSender[],
): SenderClassification {
  const fromAddress = extractEmailAddress(email.fromAddress);
  const fromDomain = extractDomain(email.fromAddress);

  const exactSenderAllowed =
    fromAddress && fromDomain
      ? allowedSenders.some(
          (sender) =>
            sender.senderEmail?.toLowerCase() === fromAddress &&
            (!sender.senderDomain ||
              fromDomain === sender.senderDomain.toLowerCase() ||
              fromDomain.endsWith(`.${sender.senderDomain.toLowerCase()}`)),
        )
      : false;

  const domainSenderAllowed =
    fromDomain
      ? allowedSenders.some((sender) => {
          if (!sender.senderDomain) {
            return false;
          }

          const allowedDomain = sender.senderDomain.toLowerCase();
          return fromDomain === allowedDomain || fromDomain.endsWith(`.${allowedDomain}`);
        })
      : false;

  return {
    senderMatchType: exactSenderAllowed ? 'email' : domainSenderAllowed ? 'domain' : 'none',
    exactSenderAllowed,
    domainSenderAllowed,
    fromAddress,
    fromDomain,
  };
}

export function evaluateEmailAuthenticity(
  email: NormalizedInboundEmail,
  allowedSenders: AllowedBankSender[],
): AuthEvaluationResult {
  const authResults = email.headerMap['authentication-results']?.join(' ') ?? '';
  const replyToAddress = extractEmailAddress(email.replyToAddress);
  const returnPath = extractEmailAddress(email.returnPathAddress);
  const replyToDomain = extractDomain(email.replyToAddress);
  const { exactSenderAllowed, domainSenderAllowed, fromAddress, fromDomain } = classifyAllowedSender(
    email,
    allowedSenders,
  );
  const senderAllowed =
    fromAddress || fromDomain ? exactSenderAllowed || domainSenderAllowed : 'unknown';

  const dkimPassDetected = authResults ? /dkim=pass/i.test(authResults) : 'unknown';
  const spfPassDetected = authResults ? /spf=pass/i.test(authResults) : 'unknown';
  const dmarcPassDetected = authResults ? /dmarc=pass/i.test(authResults) : 'unknown';
  const replyToMismatch =
    replyToAddress && fromDomain && replyToDomain
      ? replyToDomain !== fromDomain
      : 'unknown';
  const suspiciousDomain = fromDomain
    ? exactSenderAllowed
      ? false
      : isPublicMailboxDomain(fromDomain)
    : 'unknown';
  const forwardedOrResent = Boolean(
    email.headerMap['resent-from']?.length ||
      email.headerMap['x-forwarded-to']?.length ||
      email.subject?.trim().toLowerCase().startsWith('fwd:'),
  );

  let score = 0;
  if (senderAllowed === true) score += AUTH_SCORE_WEIGHTS.senderAllowed;
  if (dkimPassDetected === true) score += AUTH_SCORE_WEIGHTS.dkimPass;
  if (spfPassDetected === true) score += AUTH_SCORE_WEIGHTS.spfPass;
  if (dmarcPassDetected === true) score += AUTH_SCORE_WEIGHTS.dmarcPass;
  if (replyToMismatch === true) score += AUTH_SCORE_WEIGHTS.replyToMismatch;
  if (suspiciousDomain === true) score += AUTH_SCORE_WEIGHTS.suspiciousDomain;
  if (forwardedOrResent === true) score += AUTH_SCORE_WEIGHTS.forwardedOrResent;

  score = Math.max(0, Math.min(100, score));

  const flags = {
    sender_allowed: senderAllowed,
    dkim_pass_detected: dkimPassDetected,
    spf_pass_detected: spfPassDetected,
    dmarc_pass_detected: dmarcPassDetected,
    reply_to_mismatch: replyToMismatch,
    suspicious_domain: suspiciousDomain,
    forwarded_or_resent: forwardedOrResent,
    return_path_present: returnPath ? true : 'unknown',
  } satisfies Record<string, boolean | 'unknown'>;

  const riskFlags: string[] = [];
  if (replyToMismatch === true) riskFlags.push('reply_to_mismatch');
  if (suspiciousDomain === true) riskFlags.push('suspicious_domain');
  if (forwardedOrResent === true) riskFlags.push('forwarded_or_resent');
  if (!authResults) riskFlags.push('authentication_results_unknown');
  if (senderAllowed === false) riskFlags.push('sender_not_allowlisted');

  const hasKnownSignal = Object.values(flags).some((value) => value !== 'unknown');

  return {
    authScore: score,
    authStatus: resolveAuthStatus(score, hasKnownSignal),
    riskFlags,
    flags,
  };
}
