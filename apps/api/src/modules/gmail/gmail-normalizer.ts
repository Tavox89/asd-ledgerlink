import type { gmail_v1 } from 'googleapis';

import { combineEmailText, extractEmailAddress } from '../email-processing/helpers';
import type { NormalizedHeader, NormalizedInboundEmail } from '../email-processing/types';

function decodeBase64Url(value?: string | null) {
  if (!value) {
    return '';
  }

  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function collectBodies(
  part: gmail_v1.Schema$MessagePart | undefined,
  bucket: { text: string[]; html: string[] },
) {
  if (!part) {
    return;
  }

  if (part.mimeType === 'text/plain' && part.body?.data) {
    bucket.text.push(decodeBase64Url(part.body.data));
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    bucket.html.push(decodeBase64Url(part.body.data));
  }

  for (const child of part.parts ?? []) {
    collectBodies(child, bucket);
  }
}

function buildHeaderMap(headers: NormalizedHeader[]) {
  return headers.reduce<Record<string, string[]>>((accumulator, header) => {
    const key = header.name.toLowerCase();
    accumulator[key] = [...(accumulator[key] ?? []), header.value];
    return accumulator;
  }, {});
}

export function normalizeGmailMessage(message: gmail_v1.Schema$Message): NormalizedInboundEmail {
  const headers: NormalizedHeader[] = (message.payload?.headers ?? [])
    .filter((header): header is { name: string; value: string } => Boolean(header.name && header.value))
    .map((header) => ({
      name: header.name,
      value: header.value,
    }));

  const bodyParts = { text: [] as string[], html: [] as string[] };
  collectBodies(message.payload, bodyParts);

  const headerMap = buildHeaderMap(headers);
  const subject = headerMap.subject?.[0] ?? null;
  const fromAddress = extractEmailAddress(headerMap.from?.[0] ?? null);
  const toAddress = extractEmailAddress(headerMap.to?.[0] ?? null);
  const replyToAddress = extractEmailAddress(headerMap['reply-to']?.[0] ?? null);
  const returnPathAddress = extractEmailAddress(headerMap['return-path']?.[0] ?? null);
  const rawTextBody = bodyParts.text.join('\n').trim() || decodeBase64Url(message.payload?.body?.data);
  const rawHtmlBody = bodyParts.html.join('\n').trim();

  return {
    gmailMessageId: message.id ?? '',
    gmailThreadId: message.threadId ?? null,
    historyId: message.historyId ?? null,
    snippet: message.snippet ?? null,
    internalDate: message.internalDate ? new Date(Number(message.internalDate)) : null,
    subject,
    fromAddress,
    toAddress,
    replyToAddress,
    returnPathAddress,
    messageIdHeader: headerMap['message-id']?.[0] ?? null,
    bodyText: combineEmailText(rawTextBody, null),
    bodyHtml: rawHtmlBody || null,
    headers,
    headerMap,
  };
}
