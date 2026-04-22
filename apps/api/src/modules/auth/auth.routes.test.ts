import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const getGoogleAuthStartUrl = vi.fn();
const handleGoogleOAuthCallback = vi.fn();

vi.mock('../gmail/gmail.service', () => ({
  getGoogleAuthStartUrl,
  handleGoogleOAuthCallback,
}));

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects the callback to the public request origin when WEB_APP_URL is still localhost', async () => {
    const { authRouter } = await import('./auth.routes');
    const app = express();
    app.use(authRouter);
    app.use(errorHandler);

    handleGoogleOAuthCallback.mockResolvedValue(undefined);

    const response = await request(app)
      .get('/auth/google/callback?code=test-code&state=default')
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'ledgerlink.asdlabs.com.ve');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://ledgerlink.asdlabs.com.ve/companies/default/settings/gmail?status=connected',
    );
    expect(handleGoogleOAuthCallback).toHaveBeenCalledWith('test-code', 'default');
  });

  it('keeps localhost redirect behavior for local development callbacks', async () => {
    const { authRouter } = await import('./auth.routes');
    const app = express();
    app.use(authRouter);
    app.use(errorHandler);

    handleGoogleOAuthCallback.mockResolvedValue(undefined);

    const response = await request(app).get('/auth/google/callback?code=test-code&state=default');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://localhost:3000/companies/default/settings/gmail?status=connected');
  });
});
