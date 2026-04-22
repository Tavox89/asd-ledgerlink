import 'dotenv/config';

import { startGmailPubSubWorker } from './pull-worker.service';

async function main() {
  const worker = startGmailPubSubWorker({
    label: 'standalone',
  });

  const stopWorker = async () => {
    await worker.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void stopWorker();
  });

  process.once('SIGTERM', () => {
    void stopWorker();
  });

  await worker.promise;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
