import { redirect } from 'next/navigation';

export default function NewTransferPage() {
  redirect('/companies/default/transfers/new');
}
