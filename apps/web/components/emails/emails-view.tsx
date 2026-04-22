'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { companyPath, useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type { InboundEmailRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

interface EmailListResponse {
  items: InboundEmailRecord[];
}

export function EmailsView() {
  const companySlug = useCompanySlug();
  const query = useQuery({
    queryKey: ['gmail-messages', companySlug],
    queryFn: () =>
      api.get<EmailListResponse>(`/companies/${companySlug}/gmail/messages?page=1&pageSize=50`),
  });

  return (
    <AppShell
      title="Correos entrantes"
      description="Notificaciones de Gmail almacenadas y normalizadas para revisión de evidencia. Los correos fuera del allowlist de remitentes se conservan, pero pasan a `ignored` en lugar de entrar al flujo de evidencia de pagos."
    >
      {query.isLoading ? (
        <LoadingCard label="Cargando correos entrantes..." />
      ) : !query.data?.items.length ? (
        <EmptyState
          title="No hay correos almacenados"
          description="Usa Sincronizar bandeja reciente o una lectura de Gmail Pub/Sub desde Configuración, o carga la semilla demo para inspeccionar notificaciones bancarias normalizadas."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Asunto</TH>
                  <TH>Remitente</TH>
                  <TH>Política del remitente</TH>
                  <TH>Autenticidad</TH>
                  <TH>Procesamiento</TH>
                  <TH>Recibido</TH>
                  <TH>Coincidencias</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.items.map((email) => (
                  <TR key={email.id}>
                    <TD>
                      <Link
                        href={companyPath(companySlug, `/emails/${email.id}`)}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {email.subject ?? 'Correo sin asunto'}
                      </Link>
                    </TD>
                    <TD>{email.fromAddress ?? 'Remitente desconocido'}</TD>
                    <TD>
                      <StatusBadge status={email.senderMatchType} />
                    </TD>
                    <TD>
                      <div className="space-y-2">
                        <StatusBadge status={email.authenticityStatus} />
                        <p className="text-xs text-muted-foreground">Puntaje {email.authScore}</p>
                      </div>
                    </TD>
                    <TD>
                      <StatusBadge status={email.processingStatus} />
                    </TD>
                    <TD>{formatDateTime(email.receivedAt)}</TD>
                    <TD>{email.matchCount}</TD>
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
