'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime, formatMoney } from '../../lib/formatters';
import type { PaginatedPaymentConsumptions, PaymentConsumptionRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

const methods = [
  { key: 'all', label: 'Todos' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'binance', label: 'Binance' },
  { key: 'pago_movil', label: 'Pago Movil' },
  { key: 'transferencia_directa', label: 'Transferencia' },
] as const;

function methodLabel(method: PaymentConsumptionRecord['method']) {
  switch (method) {
    case 'pago_movil':
      return 'Pago Movil';
    case 'transferencia_directa':
      return 'Transferencia';
    case 'binance':
      return 'Binance';
    default:
      return 'Zelle';
  }
}

function channelLabel(channel: PaymentConsumptionRecord['channel']) {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'openpos':
      return 'OpenPOS';
    case 'operator':
      return 'Operador';
    case 'system':
      return 'Sistema';
    default:
      return 'API';
  }
}

export function PaymentConsumptionsView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<(typeof methods)[number]['key']>('all');
  const query = useQuery({
    queryKey: ['payment-consumptions', companySlug, method],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (method !== 'all') {
        params.set('method', method);
      }
      return api.get<PaginatedPaymentConsumptions>(
        `/companies/${companySlug}/payments/consumptions?${params.toString()}`,
      );
    },
  });
  const releaseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<PaymentConsumptionRecord>(
        `/companies/${companySlug}/payments/consumptions/${id}/release`,
        {
          reason,
          releasedBy: 'operator-ui',
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-consumptions', companySlug] });
      toast.success('Consumo liberado con auditoria.');
    },
  });

  function release(item: PaymentConsumptionRecord) {
    const reason = window.prompt('Motivo para liberar este pago');
    if (!reason || reason.trim().length < 3) {
      return;
    }

    releaseMutation.mutate({ id: item.id, reason: reason.trim() });
  }

  return (
    <AppShell
      title="Pagos validados"
      description="Control de uso unico de pagos por metodo, canal, pedido y cajera. Desde aqui puedes liberar un consumo con auditoria si hubo una asociacion incorrecta."
    >
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Consumos activos e historicos</CardTitle>
            <CardDescription>
              Cada pago validado por WhatsApp u OpenPOS queda registrado para evitar reutilizacion.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {methods.map((item) => (
              <Button
                key={item.key}
                variant={method === item.key ? 'default' : 'outline'}
                onClick={() => setMethod(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-6">
              <LoadingCard label="Cargando pagos validados..." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Metodo</TH>
                  <TH>Referencia</TH>
                  <TH>Monto</TH>
                  <TH>Fecha pago</TH>
                  <TH>Estado</TH>
                  <TH>Canal</TH>
                  <TH>Pedido</TH>
                  <TH>Cajera</TH>
                  <TH>Validado</TH>
                  <TH>Duplicados</TH>
                  <TH>Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {(query.data?.items ?? []).map((item) => (
                  <TR key={item.id}>
                    <TD>{methodLabel(item.method)}</TD>
                    <TD className="font-mono text-xs">{item.reference ?? 'N/D'}</TD>
                    <TD>{formatMoney(item.amount, item.currency)}</TD>
                    <TD>{item.operationDate ? formatDateTime(item.operationDate) : 'N/D'}</TD>
                    <TD>
                      <StatusBadge status={item.status} />
                    </TD>
                    <TD>{channelLabel(item.channel)}</TD>
                    <TD>{item.orderNumber ?? 'N/D'}</TD>
                    <TD>{item.cashierName ?? item.cashierId ?? item.validatorPhone ?? 'N/D'}</TD>
                    <TD>{formatDateTime(item.createdAt)}</TD>
                    <TD>{item.duplicateCount}</TD>
                    <TD>
                      {item.status === 'active' ? (
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={releaseMutation.isPending}
                          onClick={() => release(item)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Liberar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {item.releaseReason ?? 'Liberado'}
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
