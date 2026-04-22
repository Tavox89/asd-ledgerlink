import type {
  CreateCompanyProfileInput,
  UpdateCompanyProfileInput,
} from '@ledgerlink/shared';

import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { serializeCompanyProfile } from '../../lib/serializers';
import { normalizeWhatsAppPhone, parseAllowedTestNumbers } from '../channels/whatsapp.helpers';

export const DEFAULT_COMPANY_SLUG = 'default';

export async function getCompanyBySlugOrThrow(companySlug: string) {
  const company = await prisma.companyProfile.findUnique({
    where: {
      slug: companySlug,
    },
    include: {
      gmailAccount: {
        include: {
          token: true,
          watches: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      },
      whatsAppChannel: true,
    },
  });

  if (!company) {
    throw new ApiError(404, 'company_not_found', 'Company profile not found.');
  }

  return company;
}

export async function getDefaultCompanyOrThrow() {
  const company = await prisma.companyProfile.findFirst({
    where: {
      OR: [{ slug: DEFAULT_COMPANY_SLUG }, { isDefault: true }],
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: {
      gmailAccount: {
        include: {
          token: true,
          watches: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      },
      whatsAppChannel: true,
    },
  });

  if (!company) {
    throw new ApiError(500, 'default_company_missing', 'Default company profile is not configured.');
  }

  return company;
}

export async function ensureDefaultCompany() {
  return prisma.companyProfile.upsert({
    where: {
      slug: DEFAULT_COMPANY_SLUG,
    },
    create: {
      slug: DEFAULT_COMPANY_SLUG,
      name: 'Default Workspace',
      isDefault: true,
      isActive: true,
      notes: 'Backfilled from the original single-company LedgerLink workspace.',
    },
    update: {
      isDefault: true,
    },
  });
}

async function upsertWhatsAppChannel(
  companyId: string,
  input: Pick<
    CreateCompanyProfileInput | UpdateCompanyProfileInput,
    'whatsAppPhoneNumber' | 'messagingServiceSid' | 'allowedTestNumbers' | 'whatsAppChannelActive'
  >,
) {
  const existing = await prisma.whatsAppChannel.findUnique({
    where: {
      companyId,
    },
  });

  const nextPhoneNumber =
    input.whatsAppPhoneNumber !== undefined
      ? normalizeWhatsAppPhone(input.whatsAppPhoneNumber)
      : existing?.phoneNumber ?? null;
  const nextMessagingServiceSid =
    input.messagingServiceSid !== undefined ? input.messagingServiceSid : existing?.messagingServiceSid ?? null;
  const nextAllowed =
    input.allowedTestNumbers !== undefined
      ? parseAllowedTestNumbers(input.allowedTestNumbers.join(','))
      : existing?.allowedTestNumbers ?? [];
  const nextIsActive =
    input.whatsAppChannelActive !== undefined
      ? input.whatsAppChannelActive
      : existing?.isActive ?? true;

  if (!nextPhoneNumber && !nextMessagingServiceSid) {
    if (existing) {
      return prisma.whatsAppChannel.update({
        where: { id: existing.id },
        data: {
          allowedTestNumbers: nextAllowed,
          isActive: nextIsActive,
        },
      });
    }

    return null;
  }

  return prisma.whatsAppChannel.upsert({
    where: {
      companyId,
    },
    create: {
      companyId,
      phoneNumber: nextPhoneNumber ?? '',
      messagingServiceSid: nextMessagingServiceSid ?? undefined,
      allowedTestNumbers: nextAllowed,
      isActive: nextIsActive,
    },
    update: {
      phoneNumber: nextPhoneNumber ?? existing?.phoneNumber ?? '',
      messagingServiceSid: nextMessagingServiceSid ?? undefined,
      allowedTestNumbers: nextAllowed,
      isActive: nextIsActive,
    },
  });
}

export async function listCompanies() {
  const companies = await prisma.companyProfile.findMany({
    include: {
      gmailAccount: {
        include: {
          token: true,
          watches: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      },
      whatsAppChannel: true,
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return companies.map(serializeCompanyProfile);
}

export async function getCompanyProfile(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  return serializeCompanyProfile(company);
}

export async function createCompanyProfile(input: CreateCompanyProfileInput) {
  const company = await prisma.companyProfile.create({
    data: {
      slug: input.slug,
      name: input.name,
      notes: input.notes ?? undefined,
      isActive: input.isActive,
    },
  });

  await upsertWhatsAppChannel(company.id, input);

  return getCompanyProfile(company.slug);
}

export async function updateCompanyProfile(
  companySlug: string,
  input: UpdateCompanyProfileInput,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);

  await prisma.companyProfile.update({
    where: {
      id: company.id,
    },
    data: {
      name: input.name ?? undefined,
      notes: input.notes ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });

  if (
    input.whatsAppPhoneNumber !== undefined ||
    input.messagingServiceSid !== undefined ||
    input.allowedTestNumbers !== undefined ||
    input.whatsAppChannelActive !== undefined
  ) {
    await upsertWhatsAppChannel(company.id, input);
  }

  return getCompanyProfile(company.slug);
}
