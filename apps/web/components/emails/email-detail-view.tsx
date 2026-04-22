'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime, formatMoney } from '../../lib/formatters';
import type { InboundEmailRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';

export function EmailDetailView({ id }: { id: string }) {
  const companySlug = useCompanySlug();
  const query = useQuery({
    queryKey: ['gmail-message', companySlug, id],
    queryFn: () => api.get<InboundEmailRecord>(`/companies/${companySlug}/gmail/messages/${id}`),
  });

  const email = query.data;

  return (
    <AppShell
      title="Detalle del correo"
      description="Inspecciona el contenido normalizado, la salida del parser y las señales de autenticidad antes de tomar cualquier decisión operativa."
    >
      {query.isLoading || !email ? (
        <LoadingCard label="Cargando detalle del correo..." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{email.subject ?? 'Correo sin asunto'}</CardTitle>
              <CardDescription>
                {email.fromAddress ?? 'Remitente desconocido'} · {formatDateTime(email.receivedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/60 p-4 text-sm leading-7 text-muted-foreground">
                {email.bodyText ?? 'No hay cuerpo de texto plano almacenado.'}
              </div>
              <div className="rounded-2xl border border-border/60 p-4">
                <p className="text-sm font-semibold">Encabezados</p>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  {email.headers?.map((header) => (
                    <div key={header.id}>
                      <span className="font-semibold text-foreground">{header.name}:</span> {header.value}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Evidencia de autenticidad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatusBadge status={email.authenticityStatus} />
                <p className="text-sm text-muted-foreground">Puntaje {email.authScore}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={email.senderMatchType} />
                  <span className="text-sm text-muted-foreground">Clasificación de política del remitente</span>
                </div>
                <div>
                  <StatusBadge status={email.processingStatus} />
                </div>
                <div className="space-y-2 text-sm">
                  {email.authenticityFlags?.riskFlags?.map((flag) => (
                    <div key={flag} className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {flag}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notificación parseada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Analizador: {email.parsedNotification?.parserName ?? 'N/D'}</p>
                <p>Banco: {email.parsedNotification?.bankName ?? 'N/D'}</p>
                <p>Referencia: {email.parsedNotification?.reference ?? 'N/D'}</p>
                <p>
                  Monto:{' '}
                  {formatMoney(
                    email.parsedNotification?.amount ?? null,
                    email.parsedNotification?.currency ?? null,
                  )}
                </p>
                <p>Fecha de transferencia: {formatDateTime(email.parsedNotification?.transferAt)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
