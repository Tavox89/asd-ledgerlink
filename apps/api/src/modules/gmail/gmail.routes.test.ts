import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const getGmailProfile = vi.fn();
const getStoredGmailMessageById = vi.fn();
const listStoredGmailMessages = vi.fn();
const registerGmailWatch = vi.fn();
const registerGmailWatchForCompanyAccount = vi.fn();
const renewGmailWatch = vi.fn();
const renewGmailWatchForCompanyAccount = vi.fn();
const setCompanyGmailAccountActive = vi.fn();
const syncRecentInboxMessages = vi.fn();
const syncRecentInboxMessagesForCompanyAccount = vi.fn();
const pullGmailPubSubMessages = vi.fn();

vi.mock('./gmail.service', () => ({
  getGmailProfile,
  getStoredGmailMessageById,
  listStoredGmailMessages,
  registerGmailWatch,
  registerGmailWatchForCompanyAccount,
  renewGmailWatch,
  renewGmailWatchForCompanyAccount,
  setCompanyGmailAccountActive,
  syncRecentInboxMessages,
  syncRecentInboxMessagesForCompanyAccount,
}));

vi.mock('../pubsub/pubsub.service', () => ({
  pullGmailPubSubMessages,
}));

describe('gmail routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates mailbox active state through the account status endpoint', async () => {
    const { gmailRouter } = await import('./gmail.routes');
    const app = express();
    app.use(express.json());
    app.use(gmailRouter);
    app.use(errorHandler);

    setCompanyGmailAccountActive.mockResolvedValue({
      id: 'gmail-account-2',
      email: 'inactive@example.com',
      isActive: false,
      hasToken: true,
      watch: null,
    });

    const response = await request(app)
      .post('/companies/default/gmail/accounts/gmail-account-2/status')
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(setCompanyGmailAccountActive).toHaveBeenCalledWith('default', 'gmail-account-2', false);
    expect(response.body).toMatchObject({
      id: 'gmail-account-2',
      email: 'inactive@example.com',
      isActive: false,
    });
  });
});
