'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type { GmailProfilePayload } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function GmailSettingsView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['gmail-profile', companySlug],
    queryFn: () => api.get<GmailProfilePayload>(`/companies/${companySlug}/gmail/profile`),
    retry: false,
  });

  const watchMutation = useMutation({
    mutationFn: () => api.post(`/companies/${companySlug}/gmail/watch/register`),
    onSuccess: async () => {
      toast.success('Suscripción de Gmail registrada.');
      await queryClient.invalidateQueries({ queryKey: ['gmail-profile', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api.post<{ listed: number; processed: number }>(`/companies/${companySlug}/gmail/messages/sync`, {
        maxMessages: 10,
      }),
    onSuccess: async (result: { listed: number; processed: number }) => {
      toast.success(`Sincronización reciente completada. ${result.processed} de ${result.listed} mensajes procesados.`);
      await queryClient.invalidateQueries({ queryKey: ['gmail-profile', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['gmail-messages', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['reviews', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['audit', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const pullMutation = useMutation({
    mutationFn: () =>
      api.post<{ processed: number }>(`/companies/${companySlug}/gmail/pubsub/pull`, { maxMessages: 10 }),
    onSuccess: async (result: { processed: number }) => {
      toast.success(`Lectura de Pub/Sub completada. ${result.processed} mensajes procesados.`);
      await queryClient.invalidateQueries({ queryKey: ['gmail-profile', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['gmail-messages', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Configuración de Gmail"
      description="Conecta el buzón operativo, registra la suscripción de Gmail y ejecuta lecturas manuales de Pub/Sub cuando quieras forzar una actualización inmediata. En desarrollo local, el API también puede consultar Pub/Sub en segundo plano."
      action={
        <Button onClick={() => (window.location.href = `${API_URL}/companies/${companySlug}/auth/google/start`)}>
          Conectar Gmail
        </Button>
      }
    >
      {profileQuery.isLoading ? (
        <LoadingCard label="Cargando estado de Gmail..." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Perfil del buzón</CardTitle>
              <CardDescription>
                Conexión OAuth administrada por el backend para el buzón principal de conciliación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/60 p-4">
                <p className="text-sm text-muted-foreground">Cuenta conectada</p>
                <p className="mt-2 text-xl font-semibold">
                  {profileQuery.data?.account?.email ?? 'No hay token activo de Gmail'}
                </p>
                <div className="mt-3">
                  <StatusBadge status={profileQuery.data?.account?.hasToken ? 'active' : 'error'} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Total de mensajes</p>
                  <p className="mt-2 text-lg font-semibold">
                    {profileQuery.data?.profile?.messagesTotal ?? 'N/D'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Total de conversaciones</p>
                  <p className="mt-2 text-lg font-semibold">
                    {profileQuery.data?.profile?.threadsTotal ?? 'N/D'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Controles de suscripción y lectura</CardTitle>
              <CardDescription>
                Controles operativos manuales para desarrollo local y actualización de evidencia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/60 p-4">
                <p className="text-sm text-muted-foreground">Suscripción actual</p>
                <div className="mt-2 flex items-center gap-3">
                  <StatusBadge status={profileQuery.data?.account?.watch?.status ?? 'pending'} />
                  <span className="text-sm text-muted-foreground">
                    {profileQuery.data?.account?.watch?.expirationAt
                      ? formatDateTime(profileQuery.data.account.watch.expirationAt)
                      : 'No hay suscripción registrada'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => watchMutation.mutate()} disabled={watchMutation.isPending}>
                  Registrar suscripción
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  Sincronizar bandeja reciente
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => pullMutation.mutate()}
                  disabled={pullMutation.isPending}
                >
                  Lectura manual de Pub/Sub
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
