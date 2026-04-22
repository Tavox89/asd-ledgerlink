import { redirect } from 'next/navigation';

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/companies/default/emails/${id}`);
}
