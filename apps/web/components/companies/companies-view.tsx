'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { companyPath } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type { CompanyRecord } from '../../lib/types';
import { AppShell } from '../layout/app-shell';
import { StatusBadge } from '../layout/status-badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { LoadingCard } from '../ui/loading-card';
import { Textarea } from '../ui/textarea';

function splitNumbers(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CompaniesView() {
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    notes: '',
    isActive: true,
    whatsAppPhoneNumber: '',
    messagingServiceSid: '',
    allowedTestNumbers: '',
    whatsAppChannelActive: true,
  });
  const [editForms, setEditForms] = useState<Record<string, typeof createForm>>({});

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get<CompanyRecord[]>('/companies'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<CompanyRecord>('/companies', {
        name: createForm.name,
        slug: createForm.slug,
        notes: createForm.notes || null,
        isActive: createForm.isActive,
        whatsAppPhoneNumber: createForm.whatsAppPhoneNumber || null,
        messagingServiceSid: createForm.messagingServiceSid || null,
        allowedTestNumbers: splitNumbers(createForm.allowedTestNumbers),
        whatsAppChannelActive: createForm.whatsAppChannelActive,
      }),
    onSuccess: async () => {
      toast.success('Perfil de empresa creado.');
      setCreateForm({
        name: '',
        slug: '',
        notes: '',
        isActive: true,
        whatsAppPhoneNumber: '',
        messagingServiceSid: '',
        allowedTestNumbers: '',
        whatsAppChannelActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ slug, form }: { slug: string; form: typeof createForm }) =>
      api.patch<CompanyRecord>(`/companies/${slug}`, {
        name: form.name,
        notes: form.notes || null,
        isActive: form.isActive,
        whatsAppPhoneNumber: form.whatsAppPhoneNumber || null,
        messagingServiceSid: form.messagingServiceSid || null,
        allowedTestNumbers: splitNumbers(form.allowedTestNumbers),
        whatsAppChannelActive: form.whatsAppChannelActive,
      }),
    onSuccess: async () => {
      toast.success('Perfil de empresa actualizado.');
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Empresas"
      description="Crea perfiles de empresa aislados, revisa el resumen de cada buzón o línea de WhatsApp y entra al espacio de conciliación con contexto explícito de empresa."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Crear empresa</CardTitle>
            <CardDescription>
              Cada empresa tiene su propio buzón de Gmail, línea de WhatsApp, reglas de remitentes, transferencias e historial de verificación.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Input
              placeholder="Nombre de la empresa"
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="Identificador"
              value={createForm.slug}
              onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
            />
            <Input
              placeholder="Teléfono de WhatsApp"
              value={createForm.whatsAppPhoneNumber}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, whatsAppPhoneNumber: event.target.value }))
              }
            />
            <Input
              placeholder="SID del servicio de mensajería"
              value={createForm.messagingServiceSid}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, messagingServiceSid: event.target.value }))
              }
            />
            <div className="md:col-span-2">
              <Input
                placeholder="Números de prueba permitidos separados por comas"
                value={createForm.allowedTestNumbers}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, allowedTestNumbers: event.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <Textarea
                placeholder="Notas"
                value={createForm.notes}
                onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.isActive}
                  onChange={(event) => setCreateForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Empresa activa
              </label>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                Crear empresa
              </Button>
            </div>
          </CardContent>
        </Card>

        {companiesQuery.isLoading ? (
          <LoadingCard label="Cargando perfiles de empresa..." />
        ) : (
          <div className="space-y-4">
            {(companiesQuery.data ?? []).map((company) => {
              const form =
                editForms[company.slug] ??
                ({
                  name: company.name,
                  slug: company.slug,
                  notes: company.notes ?? '',
                  isActive: company.isActive,
                  whatsAppPhoneNumber: company.whatsAppChannel?.phoneNumber ?? '',
                  messagingServiceSid: company.whatsAppChannel?.messagingServiceSid ?? '',
                  allowedTestNumbers: (company.whatsAppChannel?.allowedTestNumbers ?? []).join(', '),
                  whatsAppChannelActive: company.whatsAppChannel?.isActive ?? true,
                } satisfies typeof createForm);

              return (
                <Card key={company.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle>{company.name}</CardTitle>
                        <CardDescription>
                          /{company.slug} · creada {formatDateTime(company.createdAt ?? null)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={company.isActive ? 'active' : 'inactive'} />
                        {company.isDefault ? <StatusBadge status="default" /> : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Input
                      placeholder="Nombre de la empresa"
                      value={form.name}
                      onChange={(event) =>
                        setEditForms((current) => ({
                          ...current,
                          [company.slug]: { ...form, name: event.target.value },
                        }))
                      }
                    />
                    <Input value={company.slug} disabled />
                    <Input
                      placeholder="Teléfono de WhatsApp"
                      value={form.whatsAppPhoneNumber}
                      onChange={(event) =>
                        setEditForms((current) => ({
                          ...current,
                          [company.slug]: { ...form, whatsAppPhoneNumber: event.target.value },
                        }))
                      }
                    />
                    <Input
                      placeholder="SID del servicio de mensajería"
                      value={form.messagingServiceSid}
                      onChange={(event) =>
                        setEditForms((current) => ({
                          ...current,
                          [company.slug]: { ...form, messagingServiceSid: event.target.value },
                        }))
                      }
                    />
                    <div className="md:col-span-2">
                      <Input
                        placeholder="Números de prueba permitidos separados por comas"
                        value={form.allowedTestNumbers}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [company.slug]: { ...form, allowedTestNumbers: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Textarea
                        placeholder="Notas"
                        value={form.notes}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [company.slug]: { ...form, notes: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(event) =>
                              setEditForms((current) => ({
                                ...current,
                                [company.slug]: { ...form, isActive: event.target.checked },
                              }))
                            }
                          />
                          Empresa activa
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.whatsAppChannelActive}
                            onChange={(event) =>
                              setEditForms((current) => ({
                                ...current,
                                [company.slug]: { ...form, whatsAppChannelActive: event.target.checked },
                              }))
                            }
                          />
                          WhatsApp activo
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Link href={companyPath(company.slug, '/dashboard')}>
                          <Button variant="outline">Abrir espacio</Button>
                        </Link>
                        <Button
                          onClick={() => updateMutation.mutate({ slug: company.slug, form })}
                          disabled={updateMutation.isPending}
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                    <div className="md:col-span-2 grid gap-3 rounded-2xl border border-border/60 p-4 text-sm md:grid-cols-2">
                      <div>
                        <p className="font-semibold">Gmail</p>
                        <p className="mt-1 text-muted-foreground">
                          {company.gmailAccount?.email ?? 'Sin buzón conectado'}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">Línea de WhatsApp</p>
                        <p className="mt-1 text-muted-foreground">
                          {company.whatsAppChannel?.phoneNumber ?? 'Sin línea configurada'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
