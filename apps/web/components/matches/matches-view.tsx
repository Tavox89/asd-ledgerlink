'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatMoney } from '../../lib/formatters';
import type { MatchRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

export function MatchesView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['matches', companySlug],
    queryFn: () => api.get<MatchRecord[]>(`/companies/${companySlug}/matches`),
  });

  const preconfirmMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/companies/${companySlug}/matches/${id}/preconfirm`, { note: 'Preconfirmado desde la interfaz' }),
    onSuccess: async () => {
      toast.success('Coincidencia preconfirmada.');
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['transfers', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Coincidencias"
      description="Revisa cómo las notificaciones bancarias parseadas se alinean con las transferencias esperadas, incluyendo puntajes, razones y banderas críticas."
    >
      {query.isLoading ? (
        <LoadingCard label="Cargando coincidencias..." />
      ) : !query.data?.length ? (
        <EmptyState
          title="No se generaron coincidencias"
          description="Crea transferencias esperadas e ingiere correos para poblar resultados de conciliación explicables."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Referencia</TH>
                  <TH>Monto</TH>
                  <TH>Puntaje</TH>
                  <TH>Estado</TH>
                  <TH>Banderas</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.map((match) => (
                  <TR key={match.id}>
                    <TD>
                      <div className="font-semibold">
                        {match.expectedTransfer?.referenceExpected ?? 'N/D'}
                      </div>
                      <div className="text-muted-foreground">
                        {match.parsedNotification?.reference ?? 'Sin referencia parseada'}
                      </div>
                    </TD>
                    <TD>
                      {formatMoney(
                        match.expectedTransfer?.amountExpected,
                        match.expectedTransfer?.currency,
                      )}
                    </TD>
                    <TD>{match.score}</TD>
                    <TD>
                      <StatusBadge status={match.status} />
                    </TD>
                    <TD>
                      <div className="max-w-xs text-xs text-muted-foreground">
                        {match.criticalFlags?.join(', ') || 'Sin banderas críticas'}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="outline"
                        onClick={() => preconfirmMutation.mutate(match.id)}
                        disabled={preconfirmMutation.isPending}
                      >
                        Preconfirmar
                      </Button>
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
