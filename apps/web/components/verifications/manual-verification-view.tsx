'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { useCompanySlug } from '../../lib/company';
import { formatDateTime, formatMoney } from '../../lib/formatters';
import { translateLabel, translateReasonCode } from '../../lib/labels';
import type { VerificationRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Input } from '../ui/input';
import { LoadingCard } from '../ui/loading-card';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';
import { Textarea } from '../ui/textarea';

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function displayReference(value?: string | null) {
  return value?.trim() ? value : 'Sin referencia';
}

function renderAutoRefreshMessage(result: VerificationRecord) {
  const autoRefresh = result.autoRefresh;
  if (!autoRefresh?.attempted) {
    return null;
  }

  switch (autoRefresh.status) {
    case 'retried':
      return `El reintento de Pub/Sub se ejecutó automáticamente y volvió a revisar el buzón. Se descargaron ${autoRefresh.pulled} mensaje(s) y se procesaron ${autoRefresh.processed}.`;
    case 'no_messages':
      return 'El reintento de Pub/Sub se ejecutó automáticamente, pero no había eventos nuevos de Gmail en cola para ingerir.';
    case 'failed':
      return 'Se intentó el reintento automático de Pub/Sub, pero no pudo refrescar la evidencia de Gmail en esta solicitud.';
    default:
      return null;
  }
}

export function ManualVerificationView() {
  const companySlug = useCompanySlug();
  const queryClient = useQueryClient();
  const [latestResult, setLatestResult] = useState<VerificationRecord | null>(null);
  const [form, setForm] = useState({
    referenciaEsperada: '',
    montoEsperado: '',
    moneda: 'USD',
    fechaOperacion: '',
    toleranciaMinutos: '180',
    bancoEsperado: '',
    cuentaDestinoUltimos4: '',
    nombreClienteOpcional: '',
    notas: '',
  });

  const query = useQuery({
    queryKey: ['verifications', companySlug],
    queryFn: () => api.get<VerificationRecord[]>(`/companies/${companySlug}/verifications`),
  });

  const lookupMutation = useMutation({
    mutationFn: () => {
      if (!form.fechaOperacion) {
        throw new Error('La fecha de operación es obligatoria.');
      }
      if (!toNullableString(form.nombreClienteOpcional)) {
        throw new Error('El nombre de quien envía es obligatorio con la política actual.');
      }

      return api.post<VerificationRecord>(`/companies/${companySlug}/verifications/operator-lookup`, {
        referenciaEsperada: form.referenciaEsperada,
        montoEsperado: Number(form.montoEsperado),
        moneda: form.moneda,
        fechaOperacion: new Date(form.fechaOperacion).toISOString(),
        toleranciaMinutos: Number(form.toleranciaMinutos),
        bancoEsperado: toNullableString(form.bancoEsperado),
        cuentaDestinoUltimos4: toNullableString(form.cuentaDestinoUltimos4),
        nombreClienteOpcional: toNullableString(form.nombreClienteOpcional),
        notas: toNullableString(form.notas),
      });
    },
    onSuccess: (result) => {
      setLatestResult(result);
      toast.success(
        result.autoRefresh?.status === 'retried'
          ? 'La evidencia del buzón se revisó después del reintento automático de Pub/Sub.'
          : 'La evidencia del buzón fue revisada.',
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.fechaOperacion) {
        throw new Error('La fecha de operación es obligatoria.');
      }
      if (!toNullableString(form.nombreClienteOpcional)) {
        throw new Error('El nombre de quien envía es obligatorio con la política actual.');
      }

      return api.post<VerificationRecord>(`/companies/${companySlug}/verifications/manual`, {
        referenciaEsperada: form.referenciaEsperada,
        montoEsperado: Number(form.montoEsperado),
        moneda: form.moneda,
        fechaOperacion: new Date(form.fechaOperacion).toISOString(),
        toleranciaMinutos: Number(form.toleranciaMinutos),
        bancoEsperado: toNullableString(form.bancoEsperado),
        cuentaDestinoUltimos4: toNullableString(form.cuentaDestinoUltimos4),
        nombreClienteOpcional: toNullableString(form.nombreClienteOpcional),
        notas: toNullableString(form.notas),
      });
    },
    onSuccess: async (result) => {
      setLatestResult(result);
      toast.success('Solicitud de verificación registrada.');
      await queryClient.invalidateQueries({ queryKey: ['verifications', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['transfers', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['reviews', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<VerificationRecord>(`/companies/${companySlug}/verifications/${id}/confirm`, {
        note: 'Confirmación manual desde el módulo de verificación',
      }),
    onSuccess: async (result) => {
      setLatestResult(result);
      toast.success('Verificación confirmada manualmente.');
      await queryClient.invalidateQueries({ queryKey: ['verifications', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['transfers', companySlug] });
      await queryClient.invalidateQueries({ queryKey: ['matches', companySlug] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Verificación manual"
      description="Consulta el buzón con nombre, monto y fecha después de que llegue el correo. La referencia sigue siendo opcional. Ese mismo resultado exacto de autorización es el que ahora usa el API para permitir o bloquear el cierre de la transacción."
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Entrada de verificación</CardTitle>
            <CardDescription>Usa la misma señal que enviaría un operador o un API externo después de que el correo de pago ya llegó: nombre exacto del pago, monto y fecha. La referencia ya no es obligatoria.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="Referencia (opcional)"
              value={form.referenciaEsperada}
              onChange={(event) => setForm((current) => ({ ...current, referenciaEsperada: event.target.value }))}
            />
            <Input
              placeholder="Monto"
              value={form.montoEsperado}
              onChange={(event) => setForm((current) => ({ ...current, montoEsperado: event.target.value }))}
            />
            <Input
              placeholder="Moneda"
              value={form.moneda}
              onChange={(event) => setForm((current) => ({ ...current, moneda: event.target.value.toUpperCase() }))}
            />
            <Input
              placeholder="Banco esperado (opcional)"
              value={form.bancoEsperado}
              onChange={(event) => setForm((current) => ({ ...current, bancoEsperado: event.target.value }))}
            />
            <Input
              type="datetime-local"
              value={form.fechaOperacion}
              onChange={(event) => setForm((current) => ({ ...current, fechaOperacion: event.target.value }))}
            />
            <Input
              placeholder="Minutos de tolerancia"
              value={form.toleranciaMinutos}
              onChange={(event) => setForm((current) => ({ ...current, toleranciaMinutos: event.target.value }))}
            />
            <Input
              placeholder="Últimos 4 de destino"
              value={form.cuentaDestinoUltimos4}
              onChange={(event) => setForm((current) => ({ ...current, cuentaDestinoUltimos4: event.target.value }))}
            />
            <Input
              placeholder="Nombre de quien envía"
              value={form.nombreClienteOpcional}
              onChange={(event) => setForm((current) => ({ ...current, nombreClienteOpcional: event.target.value }))}
            />
            <div className="md:col-span-2">
              <Textarea
                placeholder="Notas del operador"
                value={form.notas}
                onChange={(event) => setForm((current) => ({ ...current, notas: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || lookupMutation.isPending}
              >
                Crear solicitud registrada
              </Button>
              <Button
                onClick={() => lookupMutation.mutate()}
                disabled={lookupMutation.isPending || createMutation.isPending}
              >
                {lookupMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Revisando buzón...
                  </>
                ) : (
                  'Buscar evidencia en el buzón'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Última evaluación</CardTitle>
            <CardDescription>La misma decisión exacta ahora respalda tanto la consulta del operador como el endpoint de autorización del API.</CardDescription>
          </CardHeader>
          <CardContent>
            {lookupMutation.isPending ? (
              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 text-center">
                <LoaderCircle className="size-8 animate-spin text-primary" />
                <p className="mt-4 font-semibold">Revisando evidencia del buzón</p>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  El backend está revisando el buzón almacenado y lanzará una actualización automática de Pub/Sub si la evidencia aún no está disponible con la política actual de nombre, monto y fecha.
                </p>
              </div>
            ) : !latestResult ? (
              <EmptyState
                title="Aún no se ha evaluado ninguna verificación"
                description="Consulta el buzón con nombre, monto y fecha después de que llegue el correo. La referencia es opcional. Crea una solicitud registrada solo cuando el caso deba mantenerse abierto."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={latestResult.status} />
                    <StatusBadge status={latestResult.authorized ? 'authorized' : latestResult.reasonCode} />
                    <span className="text-sm text-muted-foreground">
                      {latestResult.authorized
                        ? 'La evidencia exacta del pago permite autorización por API'
                        : `Bloqueado por ${translateReasonCode(latestResult.reasonCode)}`}
                    </span>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {latestResult.persisted ? 'Solicitud registrada' : 'Consulta en vivo del buzón'}
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {displayReference(latestResult.transfer.referenceExpected)} ·{' '}
                    {formatMoney(latestResult.transfer.amountExpected, latestResult.transfer.currency)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nombre esperado: {latestResult.transfer.customerName ?? 'Sin nombre'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ventana: {formatDateTime(latestResult.transfer.expectedWindowFrom)} hasta{' '}
                    {formatDateTime(latestResult.transfer.expectedWindowTo)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Candidatos exactos: {latestResult.candidateCount} · Política del remitente:{' '}
                    {translateLabel(latestResult.senderMatchType)}
                  </p>
                  {renderAutoRefreshMessage(latestResult) ? (
                    <div className="mt-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
                      {renderAutoRefreshMessage(latestResult)}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm text-muted-foreground">Correo de evidencia elegido</p>
                    <p className="mt-2 font-semibold">
                      {latestResult.evidence?.subject ??
                        latestResult.strongestEmail?.subject ??
                        (latestResult.evidence || latestResult.strongestEmail
                          ? 'Correo del buzón seleccionado'
                          : 'Aún no hay correo candidato')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {latestResult.evidence?.senderAddress ?? latestResult.strongestEmail?.fromAddress ?? 'Esperando evidencia'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nombre extraído del pago:{' '}
                      {latestResult.evidence?.originatorName ??
                        latestResult.strongestEmail?.parsedNotification?.originatorName ??
                        'Sin nombre detectado'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Tipo de coincidencia del remitente:{' '}
                      {translateLabel(latestResult.evidence?.senderMatchType ?? latestResult.senderMatchType)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fecha de llegada al buzón:{' '}
                      {formatDateTime(
                        latestResult.evidence?.arrivalTimestamp ??
                          latestResult.strongestEmail?.internalDate ??
                          latestResult.strongestEmail?.receivedAt ??
                          null,
                      )}
                    </p>
                    {latestResult.evidence?.parsedPaymentTimestamp ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Fecha extraída del cuerpo: {formatDateTime(latestResult.evidence.parsedPaymentTimestamp)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm text-muted-foreground">Resultado de autorización</p>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge status={latestResult.authorized ? 'authorized' : latestResult.reasonCode} />
                      <span className="text-sm text-muted-foreground">
                        {latestResult.authorized ? 'Cierre permitido' : 'Cierre bloqueado'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Código de motivo: {translateReasonCode(latestResult.reasonCode)}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Estado de autenticidad: {translateLabel(latestResult.strongestAuthStatus ?? 'pending')} · Puntaje{' '}
                      {latestResult.strongestAuthScore ?? 'N/D'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Allowlist oficial del remitente:{' '}
                      {latestResult.officialSenderMatched === true
                        ? 'coincide'
                        : latestResult.officialSenderMatched === false
                          ? 'no coincide'
                          : 'desconocido'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-sm text-muted-foreground">Banderas de riesgo</p>
                  <p className="mt-2 text-sm">
                    {latestResult.riskFlags.length > 0 ? latestResult.riskFlags.join(', ') : 'Sin banderas críticas'}
                  </p>
                </div>

                {latestResult.bestMatch ? (
                  <div className="rounded-2xl border border-border/60 p-4">
                    <p className="text-sm text-muted-foreground">Mejor coincidencia</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <StatusBadge status={latestResult.bestMatch.status} />
                      <span className="text-sm text-muted-foreground">Puntaje {latestResult.bestMatch.score}</span>
                    </div>
                    <p className="mt-2 text-sm">
                      {latestResult.bestMatch.reasons
                        .filter((reason) => reason.matched)
                        .map((reason) => reason.label)
                        .join(', ') || 'Todavía no hay razones positivas'}
                    </p>
                  </div>
                ) : null}

                {latestResult.persisted ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => confirmMutation.mutate(latestResult.id)}
                      disabled={
                        confirmMutation.isPending ||
                        latestResult.canTreatAsConfirmed ||
                        latestResult.status === 'confirmed_manual'
                      }
                    >
                      Confirmar manualmente
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {query.isLoading ? (
        <LoadingCard label="Cargando solicitudes recientes de verificación..." />
      ) : !query.data?.length ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes recientes de verificación</CardTitle>
            <CardDescription>Estos son los mismos registros persistidos que consultará luego el flujo del API.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Referencia</TH>
                  <TH>Monto</TH>
                  <TH>Estado</TH>
                  <TH>Autorización</TH>
                  <TH>Correo principal</TH>
                  <TH>Motivo</TH>
                  <TH>Creada</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <div className="font-semibold">{displayReference(item.transfer.referenceExpected)}</div>
                      <div className="text-muted-foreground">{item.transfer.customerName ?? 'Sin nombre'}</div>
                      <div className="text-muted-foreground">{item.transfer.expectedBank}</div>
                    </TD>
                    <TD>{formatMoney(item.transfer.amountExpected, item.transfer.currency)}</TD>
                    <TD>
                      <StatusBadge status={item.status} />
                    </TD>
                    <TD>
                      <StatusBadge status={item.authorized ? 'authorized' : item.reasonCode} />
                    </TD>
                    <TD>{item.evidence?.subject ?? item.strongestEmail?.subject ?? 'Aún sin evidencia'}</TD>
                    <TD>{translateReasonCode(item.reasonCode)}</TD>
                    <TD>{formatDateTime(item.createdAt)}</TD>
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
