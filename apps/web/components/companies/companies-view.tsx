'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Copy, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '../../lib/api';
import { companyPath } from '../../lib/company';
import { formatDateTime } from '../../lib/formatters';
import type {
  CompanyRecord,
  IntegrationApiTokenRecord,
  IssuedIntegrationApiTokenRecord,
} from '../../lib/types';
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

function TokenScopesField({
  selectedScopes,
  onChange,
}: {
  selectedScopes: string[];
  onChange: (next: string[]) => void;
}) {
  const options = [
    {
      value: 'verifications:authorize',
      label: 'Autorizar pagos',
      description: 'Permite usar el endpoint de autorización binaria del bridge.',
    },
    {
      value: 'verifications:lookup',
      label: 'Consultar lookup',
      description: 'Permite usar el endpoint detallado de lookup desde WordPress/OpenPOS.',
    },
  ];

  return (
    <div className="grid gap-2 rounded-2xl border border-border/60 p-4">
      <div>
        <p className="font-semibold">Scopes del token</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Define exactamente qué puede hacer esa integración externa.
        </p>
      </div>
      <div className="grid gap-2">
        {options.map((option) => {
          const checked = selectedScopes.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-3 text-sm"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selectedScopes, option.value]);
                    return;
                  }

                  onChange(selectedScopes.filter((value) => value !== option.value));
                }}
              />
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-1 block text-muted-foreground">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CompanyIntegrationTokensPanel({ company }: { company: CompanyRecord }) {
  const queryClient = useQueryClient();
  const [tokenForm, setTokenForm] = useState({
    name: '',
    expiresAt: '',
    scopes: ['verifications:authorize', 'verifications:lookup'],
  });
  const [latestIssuedToken, setLatestIssuedToken] = useState<IssuedIntegrationApiTokenRecord | null>(null);

  const tokensQuery = useQuery({
    queryKey: ['integration-tokens', company.slug],
    queryFn: () => api.get<IntegrationApiTokenRecord[]>(`/companies/${company.slug}/integration-tokens`),
  });

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      if (!tokenForm.name.trim()) {
        throw new Error('El nombre del token es obligatorio.');
      }

      if (tokenForm.scopes.length === 0) {
        throw new Error('Selecciona al menos un scope.');
      }

      return api.post<IssuedIntegrationApiTokenRecord>(`/companies/${company.slug}/integration-tokens`, {
        name: tokenForm.name.trim(),
        scopes: tokenForm.scopes,
        expiresAt: tokenForm.expiresAt ? new Date(tokenForm.expiresAt).toISOString() : null,
        createdByUserId: 'web-ui',
      });
    },
    onSuccess: async (result) => {
      setLatestIssuedToken(result);
      setTokenForm({
        name: '',
        expiresAt: '',
        scopes: ['verifications:authorize', 'verifications:lookup'],
      });
      toast.success('Token de integración creado. Cópialo ahora; LedgerLink no lo mostrará otra vez.');
      await queryClient.invalidateQueries({ queryKey: ['integration-tokens', company.slug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<IntegrationApiTokenRecord>(`/companies/${company.slug}/integration-tokens/${id}/revoke`),
    onSuccess: async () => {
      toast.success('Token revocado.');
      await queryClient.invalidateQueries({ queryKey: ['integration-tokens', company.slug] });
    },
    onError: (error) => toast.error(error.message),
  });

  const copyToken = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Token copiado al portapapeles.');
  };

  return (
    <div className="md:col-span-2 rounded-2xl border border-border/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-primary" />
            Acceso de integración
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea aquí el bearer token que luego entregas a la empresa para configurar el pago en WordPress/OpenPOS.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" />
          El secreto completo solo sale una vez
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3">
          <Input
            placeholder="Nombre del token"
            value={tokenForm.name}
            onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))}
          />
          <Input
            type="datetime-local"
            value={tokenForm.expiresAt}
            onChange={(event) => setTokenForm((current) => ({ ...current, expiresAt: event.target.value }))}
          />
          <TokenScopesField
            selectedScopes={tokenForm.scopes}
            onChange={(scopes) => setTokenForm((current) => ({ ...current, scopes }))}
          />
          <div className="flex justify-end">
            <Button onClick={() => createTokenMutation.mutate()} disabled={createTokenMutation.isPending}>
              Crear token
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {latestIssuedToken ? (
            <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/30">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Token recién emitido</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Guárdalo y compártelo con la empresa ahora. LedgerLink no volverá a mostrar este secreto.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setLatestIssuedToken(null)}>
                  <EyeOff className="mr-2 size-4" />
                  Ocultar
                </Button>
              </div>
              <div className="mt-3 rounded-xl border border-border/60 bg-background/80 p-3">
                <p className="break-all font-mono text-xs">{latestIssuedToken.token}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  Prefijo: <span className="font-mono">{latestIssuedToken.tokenPrefix}</span>
                </div>
                <Button variant="outline" onClick={() => copyToken(latestIssuedToken.token)}>
                  <Copy className="mr-2 size-4" />
                  Copiar token
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3">
            <div>
              <p className="font-semibold">Tokens emitidos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Úsalos para entregar acceso por empresa y revócalos cuando cambie la integración.
              </p>
            </div>

            {tokensQuery.isLoading ? (
              <LoadingCard label="Cargando tokens..." />
            ) : (tokensQuery.data ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                Esta empresa todavía no tiene tokens de integración.
              </div>
            ) : (
              <div className="space-y-3">
                {(tokensQuery.data ?? []).map((token) => {
                  const status = token.revokedAt ? 'revoked' : token.isActive ? 'active' : 'expired';
                  return (
                    <div key={token.id} className="rounded-2xl border border-border/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{token.name}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{token.tokenPrefix}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          {!token.revokedAt ? (
                            <Button
                              variant="outline"
                              onClick={() => revokeTokenMutation.mutate(token.id)}
                              disabled={revokeTokenMutation.isPending}
                            >
                              Revocar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {token.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                        <p>Creado: {formatDateTime(token.createdAt)}</p>
                        <p>Último uso: {formatDateTime(token.lastUsedAt ?? null)}</p>
                        <p>Vence: {token.expiresAt ? formatDateTime(token.expiresAt) : 'No vence'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
                    <CompanyIntegrationTokensPanel company={company} />
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
