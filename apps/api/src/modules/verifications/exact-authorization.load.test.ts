import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';

const prismaMock = {
  inboundEmail: {
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

function buildInput(overrides: Partial<CreateManualVerificationInput> = {}): CreateManualVerificationInput {
  return {
    referenciaEsperada: 'REF879231',
    montoEsperado: 1250.5,
    moneda: 'VES',
    fechaOperacion: '2026-04-17T10:30:00.000Z',
    toleranciaMinutos: 30,
    bancoEsperado: 'Banesco',
    cuentaDestinoUltimos4: '4821',
    nombreClienteOpcional: 'CLUB SAMS CARACAS',
    notas: null,
    ...overrides,
  };
}

describe('exact authorization candidate loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inboundEmail.findMany.mockResolvedValue([]);
  });

  it('loads candidate emails only from active Gmail inboxes', async () => {
    const { buildExactAuthorizationSpec, loadVerificationCandidateEmails } = await import('./exact-authorization');

    const spec = buildExactAuthorizationSpec('company-default', buildInput());
    await loadVerificationCandidateEmails(spec);

    expect(prismaMock.inboundEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-default',
          gmailAccount: {
            is: {
              isActive: true,
            },
          },
        }),
      }),
    );
  });
});
