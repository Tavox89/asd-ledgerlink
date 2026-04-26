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
                <CardTitle>Estado de buzones Gmail</CardTitle>
                <CardDescription>
                  Estado agregado de los buzones conectados y del ciclo de suscripción de cada uno.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm text-muted-foreground">Buzones conectados</p>
                    <p className="mt-2 text-lg font-semibold">{data.connectedInboxCount}</p>
                    <div className="mt-3">
                      <StatusBadge status={data.gmailConnected ? 'active' : 'error'} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm text-muted-foreground">Salud de suscripciones</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Activas {data.watchHealthSummary.active}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        Pendientes {data.watchHealthSummary.pending}
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Expiradas {data.watchHealthSummary.expired}
                      </span>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        Error {data.watchHealthSummary.error}
                      </span>
                    </div>
                  </div>
                </div>

                {data.gmailAccounts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    No hay buzones conectados todavía.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {data.gmailAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-[1.2fr_1fr_1fr]"
                      >
                        <div>
                          <p className="text-sm text-muted-foreground">Buzón</p>
                          <p className="mt-1 font-semibold">{account.email}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Último sync: {formatDateTime(account.lastSyncedAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Suscripción</p>
                          <div className="mt-2 flex items-center gap-3">
                            <StatusBadge status={account.watch?.status ?? 'pending'} />
                            <span className="text-xs text-muted-foreground">
                              {account.watch?.expirationAt
                                ? `Vence ${formatDateTime(account.watch.expirationAt)}`
                                : 'Sin suscripción'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Historial</p>
                          <p className="mt-2 text-xs font-mono text-muted-foreground">
                            {account.watch?.historyId ?? 'N/D'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
