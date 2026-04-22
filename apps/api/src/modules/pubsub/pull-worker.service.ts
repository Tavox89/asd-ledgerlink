import { setTimeout as sleep } from 'node:timers/promises';

import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { logger } from '../../lib/logger';
import { pullGmailPubSubMessages } from './pubsub.service';

interface GmailPubSubWorkerOptions {
  intervalMs?: number;
  maxMessages?: number;
  once?: boolean;
  label?: string;
}

export interface GmailPubSubWorkerHandle {
  stop: () => Promise<void>;
  promise: Promise<void>;
}

function isRecoverablePubSubAutomationError(error: unknown) {
  return (
    error instanceof ApiError &&
    ['gmail_watch_missing', 'gmail_not_connected', 'google_cloud_credentials_missing'].includes(error.code)
  );
}

export function startGmailPubSubWorker(
  options: GmailPubSubWorkerOptions = {},
): GmailPubSubWorkerHandle {
  const intervalMs =
    options.intervalMs ??
    (env.GMAIL_PUBSUB_WORKER_INTERVAL_MS > 0 ? env.GMAIL_PUBSUB_WORKER_INTERVAL_MS : 15000);
  const maxMessages = options.maxMessages ?? env.GMAIL_PUBSUB_PULL_MAX_MESSAGES;
  const once = options.once ?? false;
  const label = options.label ?? 'api';
  const controller = new AbortController();
  let stopped = false;
  let lastRecoverableCode: string | null = null;

  const promise = (async () => {
    logger.info(
      {
        label,
        once,
        intervalMs,
        maxMessages,
      },
      'Starting Gmail Pub/Sub worker',
      );

    while (!stopped) {
      try {
        const result = await pullGmailPubSubMessages(undefined, maxMessages);
        if (result.pulled > 0 || result.processed > 0) {
          logger.info(
            {
              label,
              pulled: result.pulled,
              processed: result.processed,
            },
            'Gmail Pub/Sub worker processed a pull cycle',
          );
        }

        lastRecoverableCode = null;
      } catch (error) {
        if (isRecoverablePubSubAutomationError(error)) {
          if (lastRecoverableCode !== error.code) {
            logger.warn(
              {
                label,
                code: error.code,
                message: error.message,
              },
              'Gmail Pub/Sub worker is waiting for local setup to be ready',
            );
          }

          lastRecoverableCode = error.code;
        } else {
          logger.error({ err: error, label }, 'Gmail Pub/Sub worker cycle failed');
          lastRecoverableCode = null;
        }
      }

      if (once || stopped) {
        break;
      }

      try {
        await sleep(intervalMs, undefined, { signal: controller.signal });
      } catch {
        break;
      }
    }

    logger.info({ label }, 'Stopped Gmail Pub/Sub worker');
  })();

  return {
    promise,
    stop: async () => {
      if (stopped) {
        await promise;
        return;
      }

      stopped = true;
      controller.abort();
      await promise;
    },
  };
}
