import 'dotenv/config';

import { env } from './config/env';
import { logger } from './lib/logger';
import { startGmailPubSubWorker } from './modules/pubsub/pull-worker.service';
import { createApp } from './app';

const app = createApp();
let workerHandle: ReturnType<typeof startGmailPubSubWorker> | null = null;

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'LedgerLink API listening');

  if (env.NODE_ENV !== 'test' && env.GMAIL_PUBSUB_WORKER_INTERVAL_MS > 0) {
    workerHandle = startGmailPubSubWorker({
      intervalMs: env.GMAIL_PUBSUB_WORKER_INTERVAL_MS,
      maxMessages: env.GMAIL_PUBSUB_PULL_MAX_MESSAGES,
      label: 'api-server',
    });
  }
});

async function shutdown() {
  if (workerHandle) {
    await workerHandle.stop();
  }
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
