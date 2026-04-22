'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { companyPath, useCompanySlug } from '../../lib/company';
import { formatDateTime, formatMoney } from '../../lib/formatters';
import type { TransferRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

export function TransfersView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['transfers', companySlug],
    queryFn: () => api.get<TransferRecord[]>(`/companies/${companySlug}/transfers`),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/companies/${companySlug}/transfers/${id}/confirm`, { note: 'Confirmación manual desde la interfaz' }),
    onSuccess: async () => {
      toast.success('Transferencia confirmada manualmente.');
      await queryClient.invalidateQueries({ queryKey: ['transfers', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Transferencias esperadas"
      description="Declara transferencias entrantes esperadas, inspecciona el estado actual de la evidencia y resuelve casos límite manualmente cuando sea necesario."
      action={
        <Link href={companyPath(companySlug, '/transfers/new')}>
          <Button>Nueva transferencia</Button>
        </Link>
      }
    >
      {query.isLoading ? (
        <LoadingCard label="Cargando transferencias esperadas..." />
      ) : !query.data?.length ? (
        <EmptyState
          title="No hay transferencias esperadas"
          description="Crea la primera transferencia esperada para activar la conciliación y el cálculo de coincidencias."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Referencia</TH>
                  <TH>Monto</TH>
                  <TH>Ventana</TH>
                  <TH>Estado</TH>
                  <TH>Coincidencias</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <div className="font-semibold">{item.referenceExpected}</div>
                      <div className="text-muted-foreground">{item.expectedBank}</div>
                    </TD>
                    <TD>{formatMoney(item.amountExpected, item.currency)}</TD>
                    <TD>
                      {formatDateTime(item.expectedWindowFrom)}
                      <br />
                      <span className="text-muted-foreground">
                        hasta {formatDateTime(item.expectedWindowTo)}
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge status={item.status} />
                    </TD>
                    <TD>{item.matchCount}</TD>
                    <TD className="text-right">
                      <Button
                        variant="outline"
                        onClick={() => confirmMutation.mutate(item.id)}
                        disabled={confirmMutation.isPending}
                      >
                        Confirmar
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
