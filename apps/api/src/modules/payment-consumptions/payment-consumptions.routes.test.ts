import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const listPaymentConsumptions = vi.fn();
const releasePaymentConsumption = vi.fn();

vi.mock('./payment-consumptions.service', () => ({
  listPaymentConsumptions,
  releasePaymentConsumption,
}));

describe('payment consumption routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists consumed payments by company and method', async () => {
    const { paymentConsumptionsRouter } = await import('./payment-consumptions.routes');
    const app = express();
    app.use(express.json());
    app.use(paymentConsumptionsRouter);
    app.use(errorHandler);

    listPaymentConsumptions.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          id: 'payment-1',
          method: 'zelle',
          status: 'active',
          reference: 'REF123',
          orderNumber: 'order-1',
          cashierId: 'cashier-1',
          channel: 'openpos',
        },
      ],
    });

    const response = await request(app)
      .get('/companies/default/payments/consumptions?method=zelle')
      .send();

    expect(response.status).toBe(200);
    expect(listPaymentConsumptions).toHaveBeenCalledWith('default', {
      method: 'zelle',
      status: undefined,
      page: 1,
      pageSize: 25,
    });
    expect(response.body.items[0]).toMatchObject({
      id: 'payment-1',
      orderNumber: 'order-1',
    });
  });

  it('releases a consumed payment with an audit reason', async () => {
    const { paymentConsumptionsRouter } = await import('./payment-consumptions.routes');
    const app = express();
    app.use(express.json());
    app.use(paymentConsumptionsRouter);
    app.use(errorHandler);

    releasePaymentConsumption.mockResolvedValue({
      id: 'payment-1',
      status: 'released',
      releaseReason: 'pedido equivocado',
    });

    const response = await request(app)
      .post('/companies/default/payments/consumptions/payment-1/release')
      .send({ reason: 'pedido equivocado', releasedBy: 'admin' });

    expect(response.status).toBe(200);
    expect(releasePaymentConsumption).toHaveBeenCalledWith('default', 'payment-1', {
      reason: 'pedido equivocado',
      releasedBy: 'admin',
    });
    expect(response.body).toMatchObject({
      id: 'payment-1',
      status: 'released',
    });
  });
});
