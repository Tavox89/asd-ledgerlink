import { Badge } from '../ui/badge';
import { translateLabel } from '../../lib/labels';

const statusMap: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'neutral',
  email_received: 'info',
  authenticity_high: 'info',
  match_found: 'info',
  preconfirmed: 'success',
  requires_review: 'warning',
  needs_review: 'warning',
  rejected: 'danger',
  confirmed_manual: 'success',
  active: 'success',
  inactive: 'neutral',
  revoked: 'danger',
  expired: 'warning',
  error: 'danger',
  strong_match: 'success',
  possible_match: 'warning',
  no_match: 'neutral',
  received: 'neutral',
  parsed: 'info',
  matched: 'success',
  ignored: 'neutral',
  high: 'success',
  medium: 'info',
  low: 'warning',
  unknown: 'neutral',
  open: 'warning',
  resolved: 'success',
  escalated: 'danger',
  email: 'success',
  domain: 'info',
  none: 'neutral',
  sender: 'warning',
  reference: 'warning',
  name: 'warning',
  amount: 'warning',
  date: 'warning',
  authorized: 'success',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return <Badge variant="neutral">Desconocido</Badge>;
  }

  return (
    <Badge variant={statusMap[status] ?? 'neutral'}>
      {translateLabel(status)}
    </Badge>
  );
}
