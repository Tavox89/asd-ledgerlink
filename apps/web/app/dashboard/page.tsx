import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/companies/default/dashboard');
}
