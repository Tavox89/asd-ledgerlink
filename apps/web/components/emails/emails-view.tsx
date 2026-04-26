'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../../lib/api';
import { companyPath, useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type { GmailProfilePayload, InboundEmailRecord } from '../../lib/types';
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
  const [gmailAccountId, setGmailAccountId] = useState('');
  const gmailProfileQuery = useQuery({
    queryKey: ['gmail-profile', companySlug],
    queryFn: () => api.get<GmailProfilePayload>(`/companies/${companySlug}/gmail/profile`),
  });
  const query = useQuery({
    queryKey: ['gmail-messages', companySlug, gmailAccountId],
    queryFn: () =>
      api.get<EmailListResponse>(
        `/companies/${companySlug}/gmail/messages?page=1&pageSize=50${
          gmailAccountId ? `&gmailAccountId=${encodeURIComponent(gmailAccountId)}` : ''
        }`,
      ),
  });

  return (
    <AppShell
      title="Correos entrantes"
      description="Notificaciones de Gmail almacenadas y normalizadas para revisión de evidencia. Los correos fuera del allowlist de remitentes se conservan, pero pasan a `ignored` en lugar de entrar al flujo de evidencia de pagos."
    >
      {gmailProfileQuery.data?.accounts.length ? (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por buzón</span>
          <select
            className="rounded-2xl border border-border/70 bg-transparent px-3 py-2 text-sm"
            value={gmailAccountId}
            onChange={(event) => setGmailAccountId(event.target.value)}
          >
            <option value="">Todos los buzones</option>
            {gmailProfileQuery.data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
                  <TH>Buzón</TH>
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
                    <TD>{email.gmailAccountEmail ?? 'Buzón desconocido'}</TD>
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
