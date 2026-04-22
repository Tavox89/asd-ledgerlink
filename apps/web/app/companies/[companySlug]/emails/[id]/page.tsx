import { EmailDetailView } from '../../../../../components/emails/email-detail-view';

export default async function CompanyEmailDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; id: string }>;
}) {
  const { id } = await params;
  return <EmailDetailView id={id} />;
}
