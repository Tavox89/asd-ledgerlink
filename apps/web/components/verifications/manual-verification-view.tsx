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

function hasIdentityInput(form: { referenciaEsperada: string; nombreClienteOpcional: string }) {
  return Boolean(
    toNullableString(form.referenciaEsperada) || toNullableString(form.nombreClienteOpcional),
  );
}

function displayReference(value?: string | null) {
  return value?.trim() ? value : 'Sin referencia';
}

type VerificationFormMode = 'zelle' | 'binance';

function methodLabel(method: VerificationFormMode | string | null | undefined) {
  return method === 'binance' ? 'Binance' : 'Zelle';
}

function binanceMatchModeLabel(mode: string | null | undefined) {
  switch (mode) {
    case 'both':
      return 'ID de orden y nombre';
    case 'reference_only':
      return 'ID de orden';
    case 'name_only':
      return 'Nombre del pagador';
    default:
      return 'Sin coincidencia';
  }
}

function binanceDateStrategyLabel(strategy: string | null | undefined) {
  switch (strategy) {
    case 'exact_window':
      return 'ventana exacta';
    case 'same_day':
      return 'mismo día';
    default:
      return 'sin fecha válida';
  }
}

function inferVerificationMethod(result: VerificationRecord | null): VerificationFormMode {
  return result?.verificationMethod === 'binance' || result?.transfer.expectedBank === 'Binance'
    ? 'binance'
    : 'zelle';
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
  const [mode, setMode] = useState<VerificationFormMode>('zelle');
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

  const modeReferenceLabel = mode === 'binance' ? 'ID de orden' : 'Referencia';
  const modeNameLabel = mode === 'binance' ? 'Nombre del pagador' : 'Nombre de quien envía';
  const isBinanceMode = mode === 'binance';
  const lookupActionLabel = isBinanceMode ? 'Consultar Binance API' : 'Buscar evidencia en el buzón';
  const lookupLoadingLabel = isBinanceMode ? 'Consultando Binance...' : 'Revisando buzón...';
  const operatorLookupPath =
    mode === 'binance'
      ? `/companies/${companySlug}/verifications/binance/operator-lookup`
      : `/companies/${companySlug}/verifications/operator-lookup`;
  const createManualPath =
    mode === 'binance'
      ? `/companies/${companySlug}/verifications/binance/manual`
      : `/companies/${companySlug}/verifications/manual`;

  const query = useQuery({
    queryKey: ['verifications', companySlug],
    queryFn: () => api.get<VerificationRecord[]>(`/companies/${companySlug}/verifications`),
  });

  const lookupMutation = useMutation({
    mutationFn: () => {
      if (!form.fechaOperacion) {
        throw new Error('La fecha de operación es obligatoria.');
      }
      if (!hasIdentityInput(form)) {
        throw new Error('Debes informar referencia, nombre o ambos.');
      }

      return api.post<VerificationRecord>(operatorLookupPath, {
        referenciaEsperada: form.referenciaEsperada,
        montoEsperado: form.montoEsperado,
        moneda: mode === 'binance' ? 'USD' : form.moneda,
        fechaOperacion: new Date(form.fechaOperacion).toISOString(),
        toleranciaMinutos: Number(form.toleranciaMinutos),
        bancoEsperado: mode === 'binance' ? null : toNullableString(form.bancoEsperado),
        cuentaDestinoUltimos4: toNullableString(form.cuentaDestinoUltimos4),
        nombreClienteOpcional: toNullableString(form.nombreClienteOpcional),
        notas: toNullableString(form.notas),
      });
    },
    onSuccess: (result) => {
      setLatestResult(result);
      const successMessage =
        mode === 'binance'
          ? 'Binance API consultada.'
          : result.autoRefresh?.status === 'retried'
            ? 'La evidencia del buzón se revisó después del reintento automático de Pub/Sub.'
            : 'La evidencia del buzón fue revisada.';
      toast.success(successMessage);
    },
    onError: (error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.fechaOperacion) {
        throw new Error('La fecha de operación es obligatoria.');
      }
      if (!hasIdentityInput(form)) {
        throw new Error('Debes informar referencia, nombre o ambos.');
      }

      return api.post<VerificationRecord>(createManualPath, {
        referenciaEsperada: form.referenciaEsperada,
        montoEsperado: form.montoEsperado,
        moneda: mode === 'binance' ? 'USD' : form.moneda,
        fechaOperacion: new Date(form.fechaOperacion).toISOString(),
        toleranciaMinutos: Number(form.toleranciaMinutos),
        bancoEsperado: mode === 'binance' ? null : toNullableString(form.bancoEsperado),
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
      description={
        isBinanceMode
          ? 'Consulta Binance API con ID de orden, nombre del pagador o ambos, además de monto y fecha. La captura de WhatsApp solo sirve para extraer esos datos.'
          : 'Consulta el buzón con referencia, nombre o ambos, además de monto y fecha después de que llegue el correo. Ese mismo resultado exacto de autorización es el que usa el API para permitir o bloquear el cierre de la transacción.'
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Entrada de verificación</CardTitle>
            <CardDescription>
              {isBinanceMode
                ? 'Usa el ID de orden o los datos extraídos de la captura para consultar directamente Binance. Este flujo no depende de Gmail.'
                : 'Usa la misma señal que enviaría un operador o un API externo después de que el correo de pago ya llegó. Zelle se valida con evidencia del buzón.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === 'zelle' ? 'default' : 'outline'}
                onClick={() => {
                  setMode('zelle');
                  setLatestResult(null);
                }}
              >
                Zelle
              </Button>
              <Button
                type="button"
                variant={mode === 'binance' ? 'default' : 'outline'}
                onClick={() => {
                  setMode('binance');
                  setLatestResult(null);
                  setForm((current) => ({
                    ...current,
                    moneda: 'USD',
                    bancoEsperado: '',
                  }));
                }}
              >
                Binance
              </Button>
            </div>
            <Input
              placeholder={`${modeReferenceLabel} (opcional)`}
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
              value={mode === 'binance' ? 'USD' : form.moneda}
              disabled={mode === 'binance'}
              onChange={(event) => setForm((current) => ({ ...current, moneda: event.target.value.toUpperCase() }))}
            />
            {mode === 'binance' ? (
              <Input value="Binance" disabled />
            ) : (
              <Input
                placeholder="Banco esperado (opcional)"
                value={form.bancoEsperado}
                onChange={(event) => setForm((current) => ({ ...current, bancoEsperado: event.target.value }))}
              />
            )}
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
              placeholder={`${modeNameLabel} (opcional)`}
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
              {!isBinanceMode ? (
                <Button
                  variant="outline"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || lookupMutation.isPending}
                >
                  Crear solicitud registrada
                </Button>
              ) : null}
              <Button
                onClick={() => lookupMutation.mutate()}
                disabled={lookupMutation.isPending || createMutation.isPending}
              >
                {lookupMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    {lookupLoadingLabel}
                  </>
                ) : (
                  lookupActionLabel
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
                <p className="mt-4 font-semibold">
                  {isBinanceMode ? 'Consultando Binance API' : 'Revisando evidencia del buzón'}
                </p>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {isBinanceMode
                    ? 'El backend está revisando el historial oficial de Binance Pay para el día indicado.'
                    : 'El backend está revisando el buzón almacenado y lanzará una actualización automática de Pub/Sub si la evidencia aún no está disponible con la política actual de referencia o nombre, más monto y fecha.'}
                </p>
              </div>
            ) : !latestResult ? (
              <EmptyState
                title="Aún no se ha evaluado ninguna verificación"
                description={
                  isBinanceMode
                    ? 'Consulta Binance con ID de orden, nombre o ambos, además de monto y fecha.'
                    : 'Consulta el buzón con referencia, nombre o ambos, además de monto y fecha después de que llegue el correo. Crea una solicitud registrada solo cuando el caso deba mantenerse abierto.'
                }
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
                    {methodLabel(inferVerificationMethod(latestResult))} ·{' '}
                    {latestResult.persisted
                      ? 'Solicitud registrada'
                      : inferVerificationMethod(latestResult) === 'binance'
                        ? 'Consulta oficial Binance'
                        : 'Consulta en vivo del buzón'}
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
                    {inferVerificationMethod(latestResult) === 'binance' ? (
                      <>
                        Transacciones oficiales exactas: {latestResult.candidateCount} · Receptor:{' '}
                        {latestResult.officialSenderMatched === true
                          ? 'coincide'
                          : latestResult.officialSenderMatched === false
                            ? 'no coincide'
                            : 'no confirmado'}
                      </>
                    ) : (
                      <>
                        Candidatos exactos: {latestResult.candidateCount} · Política del remitente:{' '}
                        {translateLabel(latestResult.senderMatchType)}
                      </>
                    )}
                  </p>
                  {renderAutoRefreshMessage(latestResult) ? (
                    <div className="mt-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
                      {renderAutoRefreshMessage(latestResult)}
                    </div>
                  ) : null}
                  {latestResult.binanceApi?.checked ? (
                    <div className="mt-3 rounded-2xl border border-yellow-200/70 bg-yellow-50/80 px-4 py-3 text-sm text-yellow-950 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-100">
                      Binance API: {latestResult.binanceApi.transactionCount} transacción(es) revisada(s)
                      {latestResult.binanceApi.evidence
                        ? ` · Coincidencia por ${binanceMatchModeLabel(latestResult.binanceApi.matchMode)} · Fecha por ${binanceDateStrategyLabel(latestResult.binanceApi.dateStrategy)}`
                        : latestResult.binanceApi.errorCode
                          ? ` · Error: ${latestResult.binanceApi.errorCode}`
                          : ''}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 p-4">
                    {inferVerificationMethod(latestResult) === 'binance' ? (
                      <>
                        <p className="text-sm text-muted-foreground">Evidencia oficial Binance</p>
                        <p className="mt-2 font-semibold">
                          {latestResult.binanceApi?.evidence
                            ? `Orden ${latestResult.binanceApi.evidence.transactionId ?? 'sin ID'}`
                            : 'Sin transacción oficial coincidente'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Pagador: {latestResult.binanceApi?.evidence?.payerName ?? 'Sin nombre detectado'}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Monto API:{' '}
                          {formatMoney(
                            latestResult.binanceApi?.evidence?.amount ?? latestResult.transfer.amountExpected,
                            latestResult.binanceApi?.evidence?.currency ?? latestResult.transfer.currency,
                          )}
                          {latestResult.binanceApi?.evidence?.assetSymbol
                            ? ` · Activo ${latestResult.binanceApi.evidence.assetSymbol}`
                            : ''}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fecha API: {formatDateTime(latestResult.binanceApi?.evidence?.transactionTime ?? null)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Coincidencia: {binanceMatchModeLabel(latestResult.binanceApi?.matchMode)} ·{' '}
                          {binanceDateStrategyLabel(latestResult.binanceApi?.dateStrategy)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Receptor configurado:{' '}
                          {latestResult.binanceApi?.evidence?.receiverMatched === true
                            ? 'coincide'
                            : latestResult.binanceApi?.evidence?.receiverMatched === false
                              ? 'no coincide'
                              : 'no informado por Binance'}
                        </p>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                      {inferVerificationMethod(latestResult) === 'binance'
                        ? 'Receptor Binance configurado: '
                        : 'Allowlist oficial del remitente: '}
                      {latestResult.officialSenderMatched === true
                        ? 'coincide'
                        : latestResult.officialSenderMatched === false
                          ? 'no coincide'
                          : inferVerificationMethod(latestResult) === 'binance'
                            ? 'no informado'
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
                  <TH>Evidencia</TH>
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
                      <div className="text-muted-foreground">{methodLabel(inferVerificationMethod(item))}</div>
                      <div className="text-muted-foreground">{item.transfer.expectedBank}</div>
                    </TD>
                    <TD>{formatMoney(item.transfer.amountExpected, item.transfer.currency)}</TD>
                    <TD>
                      <StatusBadge status={item.status} />
                    </TD>
                    <TD>
                      <StatusBadge status={item.authorized ? 'authorized' : item.reasonCode} />
                    </TD>
                    <TD>
                      {inferVerificationMethod(item) === 'binance'
                        ? 'Consulta directa Binance API'
                        : item.evidence?.subject ?? item.strongestEmail?.subject ?? 'Aún sin evidencia'}
                    </TD>
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
