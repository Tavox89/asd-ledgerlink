import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { channelsRouter } from './modules/channels/channels.routes';
import { companiesRouter } from './modules/companies/companies.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { gmailRouter } from './modules/gmail/gmail.routes';
import { integrationTokensRouter } from './modules/integration-tokens/integration-tokens.routes';
import { matchesRouter } from './modules/matches/matches.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { systemRouter } from './modules/system/system.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';
import { verificationsRouter } from './modules/verifications/verifications.routes';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.WEB_APP_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
    }),
  );

  app.use(systemRouter);
  app.use(companiesRouter);
  app.use(authRouter);
  app.use(channelsRouter);
  app.use(gmailRouter);
  app.use(integrationTokensRouter);
  app.use(transfersRouter);
  app.use(verificationsRouter);
  app.use(matchesRouter);
  app.use(settingsRouter);
  app.use(dashboardRouter);
  app.use(reviewsRouter);
  app.use(auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
