import pino from 'pino';

import { env } from '../config/env';

export const logger = pino({
  name: 'ledgerlink-api',
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
