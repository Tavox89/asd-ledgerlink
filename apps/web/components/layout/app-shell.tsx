'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRightLeft,
  BadgeDollarSign,
  Building2,
  Gauge,
  Inbox,
  MailCheck,
  SearchCheck,
  Settings2,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

import { api } from '../../lib/api';
import { companyPath, DEFAULT_COMPANY_SLUG, useCompanySlug } from '../../lib/company';
import type { CompanyRecord } from '../../lib/types';
import { cn } from '../../lib/utils';
import { ThemeToggle } from './theme-toggle';

const navigation = [
  { href: '/dashboard', label: 'Panel', icon: Gauge },
  { href: '/settings/gmail', label: 'Gmail', icon: MailCheck },
  { href: '/settings/bank-senders', label: 'Remitentes', icon: Settings2 },
  { href: '/transfers', label: 'Transferencias', icon: BadgeDollarSign },
  { href: '/verifications', label: 'Verificar', icon: WalletCards },
  { href: '/emails', label: 'Correos', icon: Inbox },
  { href: '/matches', label: 'Coincidencias', icon: SearchCheck },
  { href: '/reviews', label: 'Revisiones', icon: ShieldCheck },
  { href: '/audit', label: 'Auditoría', icon: Activity },
];

export function AppShell({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const companySlug = useCompanySlug();
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get<CompanyRecord[]>('/companies'),
  });
  const isCompanyWorkspace = pathname.startsWith('/companies/');
  const workspaceSuffix = isCompanyWorkspace
    ? pathname.replace(/^\/companies\/[^/]+/, '') || '/dashboard'
    : '/dashboard';
  const activeCompany =
    companiesQuery.data?.find((item) => item.slug === companySlug) ??
    companiesQuery.data?.find((item) => item.slug === DEFAULT_COMPANY_SLUG) ??
    null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(15,23,42,0.05),rgba(255,255,255,0)),radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.09),transparent_30%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,1)),radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.09),transparent_35%)]" />
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-3xl border border-white/10 bg-white/70 p-5 shadow-panel backdrop-blur dark:bg-slate-950/75">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold">LedgerLink</p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                ASD Labs
              </p>
            </div>
          </div>

          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const href = companyPath(companySlug, item.href);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-900/60',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-border/60 bg-slate-50/80 p-4 text-sm dark:bg-slate-900/60">
            <p className="font-semibold">Creado por Tavox</p>
            <p className="mt-1 text-muted-foreground">
              Conciliación basada en evidencia para operación financiera.
            </p>
          </div>
        </aside>

        <main className="space-y-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/70 p-6 shadow-panel backdrop-blur dark:bg-slate-950/75 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                LedgerLink de ASD Labs
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
              {activeCompany ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{activeCompany.name}</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              {isCompanyWorkspace ? (
                <>
                  <Link href="/companies">
                    <button className="rounded-2xl border border-border/70 px-3 py-2 text-sm text-muted-foreground transition hover:bg-slate-100 dark:hover:bg-slate-900/60">
                      Empresas
                    </button>
                  </Link>
                  <select
                    className="rounded-2xl border border-border/70 bg-transparent px-3 py-2 text-sm"
                    value={activeCompany?.slug ?? companySlug}
                    onChange={(event) => {
                      const nextSlug = event.target.value;
                      router.push(companyPath(nextSlug, workspaceSuffix));
                    }}
                  >
                    {(companiesQuery.data ?? []).map((company) => (
                      <option key={company.id} value={company.slug}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {action}
              <ThemeToggle />
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
