'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { companyPath, useCompanySlug } from '../../lib/company';
import { AppShell } from '../layout/app-shell';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

export function NewTransferForm() {
  const companySlug = useCompanySlug();
  const router = useRouter();
  const [form, setForm] = useState({
    referenciaEsperada: '',
    montoEsperado: '',
    moneda: 'VES',
    bancoEsperado: '',
    fechaEsperadaDesde: '',
    fechaEsperadaHasta: '',
    cuentaDestinoUltimos4: '',
    nombreClienteOpcional: '',
    notas: '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/companies/${companySlug}/transfers`, {
        ...form,
        montoEsperado: Number(form.montoEsperado),
        fechaEsperadaDesde: new Date(form.fechaEsperadaDesde).toISOString(),
        fechaEsperadaHasta: new Date(form.fechaEsperadaHasta).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Transferencia esperada creada.');
      router.push(companyPath(companySlug, '/transfers'));
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Crear transferencia esperada"
      description="Captura la señal operativa esperada antes de que llegue una notificación bancaria. Esto le permite a LedgerLink comparar evidencia sin exagerar la certeza."
    >
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Datos de la transferencia</CardTitle>
          <CardDescription>Usa los identificadores esperados más fuertes disponibles.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Referencia esperada"
            value={form.referenciaEsperada}
            onChange={(event) => setForm((current) => ({ ...current, referenciaEsperada: event.target.value }))}
          />
          <Input
            placeholder="Monto esperado"
            value={form.montoEsperado}
            onChange={(event) => setForm((current) => ({ ...current, montoEsperado: event.target.value }))}
          />
          <Input
            placeholder="Moneda (VES, USD)"
            value={form.moneda}
            onChange={(event) => setForm((current) => ({ ...current, moneda: event.target.value }))}
          />
          <Input
            placeholder="Banco esperado"
            value={form.bancoEsperado}
            onChange={(event) => setForm((current) => ({ ...current, bancoEsperado: event.target.value }))}
          />
          <Input
            type="datetime-local"
            value={form.fechaEsperadaDesde}
            onChange={(event) => setForm((current) => ({ ...current, fechaEsperadaDesde: event.target.value }))}
          />
          <Input
            type="datetime-local"
            value={form.fechaEsperadaHasta}
            onChange={(event) => setForm((current) => ({ ...current, fechaEsperadaHasta: event.target.value }))}
          />
          <Input
            placeholder="Últimos 4 de la cuenta destino"
            value={form.cuentaDestinoUltimos4}
            onChange={(event) => setForm((current) => ({ ...current, cuentaDestinoUltimos4: event.target.value }))}
          />
          <Input
            placeholder="Nombre del cliente"
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
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Guardar transferencia
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
