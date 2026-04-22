'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Inbox, ShieldAlert, SignalHigh, Wifi } from 'lucide-react';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import { translateAction, translateEntityType } from '../../lib/labels';
import type { DashboardSummary } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';
import { StatCard } from './stat-card';

export function DashboardView() {
  const companySlug = useCompanySlug();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', companySlug],
    queryFn: () => api.get<DashboardSummary>(`/companies/${companySlug}/dashboard/summary`),
  });

  return (
    <AppShell
      title="Panel operativo"
      description="Monitorea la conexión de Gmail, la salud de la ingesta, la evidencia de conciliación y la actividad operativa más reciente."
    >
      {isLoading || !data ? (
        <LoadingCard label="Cargando métricas del panel..." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Correos procesados"
              value={data.counters.processedEmails}
              hint="Total de correos entrantes normalizados y almacenados."
              icon={<Inbox className="h-5 w-5" />}
            />
            <StatCard
              label="Transferencias pendientes"
              value={data.counters.pendingTransfers}
              hint="Transferencias esperadas que siguen esperando evidencia más fuerte."
              icon={<Wifi className="h-5 w-5" />}
            />
            <StatCard
              label="Coincidencias fuertes"
              value={data.counters.strongMatches}
              hint="Coincidencias con alta confianza de conciliación."
              icon={<SignalHigh className="h-5 w-5" />}
            />
            <StatCard
              label="Revisiones manuales"
              value={data.counters.manualReviews}
              hint="Casos que todavía requieren criterio del operador."
              icon={<ShieldAlert className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Estado de conexión de Gmail</CardTitle>
                <CardDescription>
                  Estado actual del buzón principal y de la suscripción activa a notificaciones.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Cuenta conectada</p>
                  <p className="mt-2 text-lg font-semibold">
                    {data.gmailAccount?.email ?? 'No conectada'}
                  </p>
                  <div className="mt-3">
                    <StatusBadge status={data.gmailConnected ? 'active' : 'error'} />
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Ciclo de la suscripción</p>
                  <div className="mt-2 flex items-center gap-3">
                    <StatusBadge status={data.watchStatus?.status ?? 'pending'} />
                    <span className="text-sm text-muted-foreground">
                      {data.watchStatus
                        ? `Vence ${formatDateTime(data.watchStatus.expirationAt)}`
                        : 'Aún no hay suscripción registrada'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-mono text-muted-foreground">
                    ID de historial: {data.watchStatus?.historyId ?? 'N/D'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actividad reciente</CardTitle>
                <CardDescription>Últimos eventos de auditoría de Gmail, transferencias y revisiones.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
                    <div className="rounded-full bg-slate-100 p-2 dark:bg-slate-900">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{translateAction(item.action)}</p>
                      <p className="text-sm text-muted-foreground">
                        {translateEntityType(item.entityType)} · {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
