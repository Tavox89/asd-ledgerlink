'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type {
  GmailAccountOperationResult,
  GmailBulkOperationResult,
  GmailProfilePayload,
} from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function summarizeBulkResult(action: string, result: GmailBulkOperationResult) {
  const failures = result.results.filter((item) => item.error);
  const summary = `${action}: ${result.succeeded}/${result.totalAccounts} buzones completados.`;

  if (failures.length > 0) {
    const failedEmails = failures.map((item) => item.email).join(', ');
    toast.error(`${summary} Fallaron: ${failedEmails}.`);
    return;
  }

  if (typeof result.processed === 'number') {
    toast.success(`${summary} ${result.processed} mensajes procesados.`);
    return;
  }

  toast.success(summary);
}

function summarizeSingleAccountResult(action: string, result: GmailAccountOperationResult) {
  if (result.error) {
    toast.error(`${action} en ${result.email}: ${result.error.message}`);
    return;
  }

  if (typeof result.processed === 'number') {
    toast.success(`${action} en ${result.email}: ${result.processed} mensajes procesados.`);
    return;
  }

  toast.success(`${action} en ${result.email} completado.`);
}

export function GmailSettingsView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['gmail-profile', companySlug],
    queryFn: () => api.get<GmailProfilePayload>(`/companies/${companySlug}/gmail/profile`),
    retry: false,
  });

  const invalidateGmailQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['gmail-profile', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['gmail-messages', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['reviews', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['audit', companySlug] });
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  const watchAllMutation = useMutation({
    mutationFn: () => api.post<GmailBulkOperationResult>(`/companies/${companySlug}/gmail/watch/register`),
    onSuccess: async (result) => {
      summarizeBulkResult('Registro de suscripciones', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncAllMutation = useMutation({
    mutationFn: () =>
      api.post<GmailBulkOperationResult>(`/companies/${companySlug}/gmail/messages/sync`, {
        maxMessages: 10,
      }),
    onSuccess: async (result) => {
      summarizeBulkResult('Sincronización global', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const pullMutation = useMutation({
    mutationFn: () =>
      api.post<GmailBulkOperationResult>(`/companies/${companySlug}/gmail/pubsub/pull`, { maxMessages: 10 }),
    onSuccess: async (result) => {
      summarizeBulkResult('Lectura de Pub/Sub', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncAccountMutation = useMutation({
    mutationFn: ({ gmailAccountId }: { gmailAccountId: string }) =>
      api.post<GmailAccountOperationResult>(
        `/companies/${companySlug}/gmail/accounts/${gmailAccountId}/messages/sync`,
        { maxMessages: 10 },
      ),
    onSuccess: async (result) => {
      summarizeSingleAccountResult('Sincronización', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const watchAccountMutation = useMutation({
    mutationFn: ({ gmailAccountId }: { gmailAccountId: string }) =>
      api.post<GmailAccountOperationResult>(
        `/companies/${companySlug}/gmail/accounts/${gmailAccountId}/watch/register`,
      ),
    onSuccess: async (result) => {
      summarizeSingleAccountResult('Registro de suscripción', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const renewAccountMutation = useMutation({
    mutationFn: ({ gmailAccountId }: { gmailAccountId: string }) =>
      api.post<GmailAccountOperationResult>(
        `/companies/${companySlug}/gmail/accounts/${gmailAccountId}/watch/renew`,
      ),
    onSuccess: async (result) => {
      summarizeSingleAccountResult('Renovación de suscripción', result);
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleAccountMutation = useMutation({
    mutationFn: ({ gmailAccountId, isActive }: { gmailAccountId: string; isActive: boolean }) =>
      api.post(`/companies/${companySlug}/gmail/accounts/${gmailAccountId}/status`, {
        isActive,
      }),
    onSuccess: async (_result, variables) => {
      toast.success(
        variables.isActive
          ? 'Buzón reactivado. Vuelve a contar para evidencia nueva.'
          : 'Buzón desactivado. Se conserva el histórico, pero deja de participar en nuevas lecturas y validaciones.',
      );
      await invalidateGmailQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Configuración de Gmail"
      description="Conecta varios buzones operativos, registra sus suscripciones de Gmail y ejecuta sincronizaciones o lecturas manuales de Pub/Sub por cuenta o para toda la empresa."
      action={
        <Button onClick={() => (window.location.href = `${API_URL}/companies/${companySlug}/auth/google/start`)}>
          Conectar otro Gmail
        </Button>
      }
    >
      {profileQuery.isLoading ? (
        <LoadingCard label="Cargando estado de Gmail..." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de buzones</CardTitle>
                <CardDescription>
                  Totales agregados de los buzones conectados y trazabilidad de la evidencia por empresa.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Buzones conectados</p>
                  <p className="mt-2 text-xl font-semibold">
                    {profileQuery.data?.summary.connectedInboxCount ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Total de mensajes</p>
                  <p className="mt-2 text-xl font-semibold">
                    {profileQuery.data?.summary.totalMessages ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Total de conversaciones</p>
                  <p className="mt-2 text-xl font-semibold">
                    {profileQuery.data?.summary.totalThreads ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Controles globales</CardTitle>
                <CardDescription>
                  Estas acciones operan sobre todos los buzones conectados de la empresa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Activas {profileQuery.data?.summary.watchHealthSummary.active ?? 0}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Inactivas {profileQuery.data?.summary.watchHealthSummary.inactive ?? 0}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Pendientes {profileQuery.data?.summary.watchHealthSummary.pending ?? 0}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    Expiradas {profileQuery.data?.summary.watchHealthSummary.expired ?? 0}
                  </span>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    Error {profileQuery.data?.summary.watchHealthSummary.error ?? 0}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => watchAllMutation.mutate()} disabled={watchAllMutation.isPending}>
                    Registrar suscripciones
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => syncAllMutation.mutate()}
                    disabled={syncAllMutation.isPending}
                  >
                    Sincronizar todos
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => pullMutation.mutate()}
                    disabled={pullMutation.isPending}
                  >
                    Leer Pub/Sub
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Buzones conectados</CardTitle>
              <CardDescription>
                Cada cuenta mantiene su propio token, watch y ciclo de sincronización. Si desactivas un buzón, se conserva el histórico, pero deja de participar en nuevas lecturas y verificaciones.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!profileQuery.data?.accounts.length ? (
                <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                  No hay buzones conectados todavía.
                </div>
              ) : (
                profileQuery.data.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid gap-4 rounded-2xl border border-border/60 p-4 xl:grid-cols-[1.2fr_1fr_1fr_auto]"
                  >
                    <div>
                      <p className="text-sm text-muted-foreground">Correo</p>
                      <p className="mt-1 text-lg font-semibold">{account.email}</p>
                      <div className="mt-2">
                        <StatusBadge status={account.isActive ? 'active' : 'inactive'} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Conectado: {formatDateTime(account.connectedAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Último sync: {formatDateTime(account.lastSyncedAt)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Perfil</p>
                      <p className="text-sm">Mensajes: {account.profile?.messagesTotal ?? 'N/D'}</p>
                      <p className="text-sm">Conversaciones: {account.profile?.threadsTotal ?? 'N/D'}</p>
                      <p className="text-xs text-muted-foreground">
                        Token: {account.hasToken ? 'activo' : 'sin conectar'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Watch</p>
                      <div>
                        <StatusBadge status={account.watch?.status ?? 'pending'} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {account.watch?.expirationAt
                          ? `Vence ${formatDateTime(account.watch.expirationAt)}`
                          : 'Sin suscripción registrada'}
                      </p>
                      {account.watch?.lastError ? (
                        <p className="text-xs text-rose-600 dark:text-rose-300">{account.watch.lastError}</p>
                      ) : null}
                      {!account.isActive ? (
                        <p className="text-xs text-muted-foreground">
                          Este buzón está pausado y no cuenta para nueva evidencia.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          (window.location.href = `${API_URL}/companies/${companySlug}/gmail/accounts/${account.id}/auth/google/start`)
                        }
                      >
                        Reconectar
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => syncAccountMutation.mutate({ gmailAccountId: account.id })}
                        disabled={syncAccountMutation.isPending || !account.isActive}
                      >
                        Sincronizar
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          account.watch
                            ? renewAccountMutation.mutate({ gmailAccountId: account.id })
                            : watchAccountMutation.mutate({ gmailAccountId: account.id })
                        }
                        disabled={watchAccountMutation.isPending || renewAccountMutation.isPending || !account.isActive}
                      >
                        {account.watch ? 'Renovar suscripción' : 'Registrar suscripción'}
                      </Button>
                      <Button
                        variant={account.isActive ? 'outline' : 'default'}
                        onClick={() =>
                          toggleAccountMutation.mutate({
                            gmailAccountId: account.id,
                            isActive: !account.isActive,
                          })
                        }
                        disabled={toggleAccountMutation.isPending}
                      >
                        {account.isActive ? 'Desactivar buzón' : 'Activar buzón'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
