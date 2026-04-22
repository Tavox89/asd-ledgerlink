'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import type { AllowedBankSenderRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Input } from '../ui/input';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';
import { Textarea } from '../ui/textarea';

export function BankSendersView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    bankName: '',
    senderEmail: '',
    senderDomain: '',
    replyToPattern: '',
    returnPathPattern: '',
    messageIdPattern: '',
    notes: '',
  });

  const query = useQuery({
    queryKey: ['bank-senders', companySlug],
    queryFn: () => api.get<AllowedBankSenderRecord[]>(`/companies/${companySlug}/settings/bank-senders`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<AllowedBankSenderRecord>(`/companies/${companySlug}/settings/bank-senders`, {
        bankName: form.bankName,
        senderEmail: form.senderEmail || null,
        senderDomain: form.senderDomain || null,
        replyToPattern: form.replyToPattern || null,
        returnPathPattern: form.returnPathPattern || null,
        messageIdPattern: form.messageIdPattern || null,
        notes: form.notes || null,
        isActive: true,
      }),
    onSuccess: async () => {
      toast.success('Remitente permitido creado.');
      setForm({
        bankName: '',
        senderEmail: '',
        senderDomain: '',
        replyToPattern: '',
        returnPathPattern: '',
        messageIdPattern: '',
        notes: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['bank-senders', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<AllowedBankSenderRecord>(`/companies/${companySlug}/settings/bank-senders/${id}`, {
        isActive,
      }),
    onSuccess: async (_result, variables) => {
      toast.success(variables.isActive ? 'Remitente permitido activado.' : 'Remitente permitido desactivado.');
      await queryClient.invalidateQueries({ queryKey: ['bank-senders', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Reglas de remitentes bancarios"
      description="Configura los correos y dominios oficiales de remitentes que LedgerLink debe considerar al evaluar la autenticidad de notificaciones bancarias."
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Agregar remitente permitido</CardTitle>
            <CardDescription>
              Estas reglas se aplican de inmediato cuando se parsean y evalúan los correos entrantes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="Nombre del banco"
              value={form.bankName}
              onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
            />
            <Input
              placeholder="Correo oficial del remitente"
              value={form.senderEmail}
              onChange={(event) => setForm((current) => ({ ...current, senderEmail: event.target.value }))}
            />
            <Input
              placeholder="Dominio oficial del remitente"
              value={form.senderDomain}
              onChange={(event) => setForm((current) => ({ ...current, senderDomain: event.target.value }))}
            />
            <Input
              placeholder="Patrón Reply-To (opcional)"
              value={form.replyToPattern}
              onChange={(event) => setForm((current) => ({ ...current, replyToPattern: event.target.value }))}
            />
            <Input
              placeholder="Patrón Return-Path (opcional)"
              value={form.returnPathPattern}
              onChange={(event) => setForm((current) => ({ ...current, returnPathPattern: event.target.value }))}
            />
            <Input
              placeholder="Patrón Message-ID (opcional)"
              value={form.messageIdPattern}
              onChange={(event) => setForm((current) => ({ ...current, messageIdPattern: event.target.value }))}
            />
            <div className="md:col-span-2">
              <Textarea
                placeholder="Notas sobre esta política de remitente"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                Guardar regla
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cómo funcionan estas reglas</CardTitle>
            <CardDescription>Usa uno o ambos identificadores principales por banco.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/60 p-4">
              <p className="font-semibold text-foreground">Correo del remitente</p>
              <p className="mt-2">
                Úsalo cuando el banco siempre envía desde una dirección fija como
                {' '}
                <span className="font-mono">notificaciones@banesco.com</span>.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 p-4">
              <p className="font-semibold text-foreground">Dominio del remitente</p>
              <p className="mt-2">
                Úsalo cuando el banco usa múltiples direcciones bajo un dominio controlado como
                {' '}
                <span className="font-mono">mercantilbanco.com</span>.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 p-4">
              <p className="font-semibold text-foreground">Patrones de encabezados</p>
              <p className="mt-2">
                Úsalos solo cuando ya conozcas las firmas de `reply-to`, `return-path` o `message-id`
                del banco y quieras un filtrado más estricto.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {query.isLoading ? (
        <LoadingCard label="Cargando remitentes bancarios permitidos..." />
      ) : !query.data?.length ? (
        <EmptyState
          title="Aún no hay reglas de remitentes"
          description="Crea el primer remitente bancario oficial antes de depender de la autenticidad del correo para la verificación automatizada."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Reglas configuradas</CardTitle>
            <CardDescription>
              Las reglas activas cuentan como remitente oficial durante la evaluación de autenticidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Banco</TH>
                  <TH>Correo del remitente</TH>
                  <TH>Dominio</TH>
                  <TH>Estado</TH>
                  <TH>Notas</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.map((item) => (
                  <TR key={item.id}>
                    <TD className="font-semibold">{item.bankName}</TD>
                    <TD>{item.senderEmail ?? 'N/D'}</TD>
                    <TD>{item.senderDomain ?? 'N/D'}</TD>
                    <TD>
                      <StatusBadge status={item.isActive ? 'active' : 'inactive'} />
                    </TD>
                    <TD>{item.notes ?? 'Sin notas'}</TD>
                    <TD className="text-right">
                      <Button
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}
                        disabled={toggleMutation.isPending}
                      >
                        {item.isActive ? 'Desactivar' : 'Activar'}
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
