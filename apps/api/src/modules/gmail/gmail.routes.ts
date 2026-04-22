import { Router } from 'express';
import {
  companySlugParamSchema,
  gmailMessagesQuerySchema,
  gmailPullSchema,
  gmailSyncRecentSchema,
  idParamSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  getGmailProfile,
  getStoredGmailMessageById,
  listStoredGmailMessages,
  registerGmailWatch,
  renewGmailWatch,
  syncRecentInboxMessages,
} from './gmail.service';
import { pullGmailPubSubMessages } from '../pubsub/pubsub.service';

export const gmailRouter = Router();

gmailRouter.get(
  '/gmail/profile',
  asyncHandler(async (_req, res) => {
    res.json(await getGmailProfile(DEFAULT_COMPANY_SLUG));
  }),
);

gmailRouter.get(
  '/companies/:companySlug/gmail/profile',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getGmailProfile(req.params.companySlug));
  }),
);

gmailRouter.get(
  '/gmail/messages',
  validateRequest({ query: gmailMessagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = gmailMessagesQuerySchema.parse(req.query);
    res.json(
      await listStoredGmailMessages(
        DEFAULT_COMPANY_SLUG,
        query.page,
        query.pageSize,
        query.processingStatus,
      ),
    );
  }),
);

gmailRouter.get(
  '/companies/:companySlug/gmail/messages',
  validateRequest({ params: companySlugParamSchema, query: gmailMessagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = gmailMessagesQuerySchema.parse(req.query);
    res.json(
      await listStoredGmailMessages(
        req.params.companySlug,
        query.page,
        query.pageSize,
        query.processingStatus,
      ),
    );
  }),
);

gmailRouter.post(
  '/gmail/messages/sync',
  asyncHandler(async (req, res) => {
    const body = gmailSyncRecentSchema.parse(req.body ?? {});
    res.json(await syncRecentInboxMessages(DEFAULT_COMPANY_SLUG, body.maxMessages, body.query));
  }),
);

gmailRouter.post(
  '/companies/:companySlug/gmail/messages/sync',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    const body = gmailSyncRecentSchema.parse(req.body ?? {});
    res.json(await syncRecentInboxMessages(req.params.companySlug, body.maxMessages, body.query));
  }),
);

gmailRouter.get(
  '/gmail/messages/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getStoredGmailMessageById(DEFAULT_COMPANY_SLUG, req.params.id));
  }),
);

gmailRouter.get(
  '/companies/:companySlug/gmail/messages/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema) }),
  asyncHandler(async (req, res) => {
    res.json(await getStoredGmailMessageById(req.params.companySlug, req.params.id));
  }),
);

gmailRouter.post(
  '/gmail/watch/register',
  asyncHandler(async (_req, res) => {
    res.json(await registerGmailWatch(DEFAULT_COMPANY_SLUG));
  }),
);

gmailRouter.post(
  '/companies/:companySlug/gmail/watch/register',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await registerGmailWatch(req.params.companySlug));
  }),
);

gmailRouter.post(
  '/gmail/watch/renew',
  asyncHandler(async (_req, res) => {
    res.json(await renewGmailWatch(DEFAULT_COMPANY_SLUG));
  }),
);

gmailRouter.post(
  '/companies/:companySlug/gmail/watch/renew',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await renewGmailWatch(req.params.companySlug));
  }),
);

gmailRouter.post(
  '/gmail/pubsub/pull',
  asyncHandler(async (req, res) => {
    const body = gmailPullSchema.parse(req.body ?? {});
    res.json(await pullGmailPubSubMessages(DEFAULT_COMPANY_SLUG, body.maxMessages));
  }),
);

gmailRouter.post(
  '/companies/:companySlug/gmail/pubsub/pull',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    const body = gmailPullSchema.parse(req.body ?? {});
    res.json(await pullGmailPubSubMessages(req.params.companySlug, body.maxMessages));
  }),
);
