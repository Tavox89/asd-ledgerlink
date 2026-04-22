'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import { translateAction, translateActorType, translateEntityType } from '../../lib/labels';
import type { AuditLogRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { Card, CardContent } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

export function AuditView() {
  const companySlug = useCompanySlug();
  const query = useQuery({
    queryKey: ['audit', companySlug],
    queryFn: () => api.get<AuditLogRecord[]>(`/companies/${companySlug}/audit`),
  });

  return (
    <AppShell
      title="Auditoría"
      description="Historial operativo inmutable de la conexión con Gmail, el ciclo del watch, las decisiones de coincidencia y las intervenciones manuales."
    >
      {query.isLoading ? (
        <LoadingCard label="Cargando eventos de auditoría..." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Actor</TH>
                  <TH>Acción</TH>
                  <TH>Entidad</TH>
                </TR>
              </THead>
              <TBody>
                {query.data?.map((log) => (
                  <TR key={log.id}>
                    <TD>{formatDateTime(log.createdAt)}</TD>
                    <TD>{translateActorType(log.actorType)}</TD>
                    <TD>{translateAction(log.action)}</TD>
                    <TD>
                      {translateEntityType(log.entityType)} · {log.entityId}
                    </TD>
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
