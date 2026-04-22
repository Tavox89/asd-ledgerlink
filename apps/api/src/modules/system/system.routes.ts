import { Router } from 'express';

import { asyncHandler } from '../../lib/http';
import { getHealthStatus, getReadinessStatus } from './system.service';

export const systemRouter = Router();

systemRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json(await getHealthStatus());
  }),
);

systemRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    res.json(await getReadinessStatus());
  }),
);
