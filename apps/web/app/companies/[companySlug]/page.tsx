import { redirect } from 'next/navigation';

export default async function CompanyIndexPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  redirect(`/companies/${companySlug}/dashboard`);
}
