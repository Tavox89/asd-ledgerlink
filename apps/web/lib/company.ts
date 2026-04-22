'use client';

import { useParams } from 'next/navigation';

export const DEFAULT_COMPANY_SLUG = 'default';

export function companyPath(companySlug: string, path: string) {
  return `/companies/${companySlug}${path.startsWith('/') ? path : `/${path}`}`;
}

export function useCompanySlug() {
  const params = useParams<{ companySlug?: string }>();
  return params?.companySlug ?? DEFAULT_COMPANY_SLUG;
}
