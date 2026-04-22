'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type { ManualReviewRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

export function ReviewsView() {
  const companySlug = useCompanySlug();
  const query = useQuery({
    queryKey: ['reviews', companySlug],
    queryFn: () => api.get<ManualReviewRecord[]>(`/companies/${companySlug}/reviews`),
  });

  return (
    <AppShell
      title="Revisiones manuales"
      description="Cola de casos ambiguos o riesgosos que requieren interpretación del operador antes de aplicar un estado de evidencia más fuerte."
    >
      {query.isLoading ? (
        <LoadingCard label="Cargando revisiones..." />
      ) : !query.data?.length ? (
        <EmptyState
          title="No hay revisiones manuales abiertas"
          description="Las coincidencias de alta confianza y bajo riesgo evitan esta cola. Los casos ambiguos aparecen aquí."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Creada</TH>
                  <TH>Estado</TH>
                  <TH>Transferencia</TH>
                  <TH>Correo</TH>
                  <TH>Notas</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.map((review) => (
                  <TR key={review.id}>
                    <TD>{formatDateTime(review.createdAt)}</TD>
                    <TD>
                      <StatusBadge status={review.status} />
                    </TD>
                    <TD>{review.expectedTransfer?.referenceExpected ?? 'N/D'}</TD>
                    <TD>{review.inboundEmail?.subject ?? 'N/D'}</TD>
                    <TD>{review.notes ?? 'Sin notas'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
