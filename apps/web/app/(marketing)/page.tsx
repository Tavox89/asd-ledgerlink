import Link from 'next/link';
import { ArrowRight, Inbox, ShieldCheck, Sparkles, Workflow } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,1))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xl font-semibold tracking-tight text-white">LedgerLink</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              ASD Labs · Creado por Tavox
            </p>
          </div>
          <Link href="/login">
            <Button className="bg-white text-slate-950 hover:bg-slate-100">Abrir espacio</Button>
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/90">
              <Sparkles className="h-3.5 w-3.5" />
              Conciliación basada en evidencia
            </div>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
              Ingesta de Gmail · controles de remitentes · autorización exacta
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white lg:text-6xl">
              Concilia notificaciones bancarias desde Gmail sin exagerar la certeza.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Conecta un buzón operativo, ingiere correos bancarios, evalúa autenticidad, extrae referencias
              y montos, y compáralos contra transferencias esperadas con estados de evidencia explícitos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/companies/default/dashboard">
                <Button className="gap-2 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                  Entrar al panel <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/companies/default/settings/gmail">
                <Button className="border border-white/10 bg-white/8 text-white hover:bg-white/14" variant="ghost">
                  Configurar Gmail
                </Button>
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Alcance del espacio</p>
                <p className="mt-3 text-2xl font-semibold text-white">Por empresa</p>
                <p className="mt-2 text-sm text-slate-300">Cada buzón, lista de remitentes, cola de revisión y línea de WhatsApp permanece aislada.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Autorización</p>
                <p className="mt-3 text-2xl font-semibold text-white">Solo exacta</p>
                <p className="mt-2 text-sm text-slate-300">Remitente, referencia, monto y hora de llegada al buzón deben alinearse.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Trazabilidad del operador</p>
                <p className="mt-3 text-2xl font-semibold text-white">Auditables</p>
                <p className="mt-2 text-sm text-slate-300">Cada ingesta, reintento, revisión e intento de WhatsApp queda persistido.</p>
              </div>
            </div>
          </div>

          <Card className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.74))] text-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.9)]">
            <CardContent className="p-0">
              <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Flujo activo del espacio</p>
                    <p className="mt-2 text-xl font-semibold text-white">default / buzón operativo</p>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    proceso activo
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center gap-3">
                    <Inbox className="h-5 w-5 text-cyan-300" />
                    <p className="font-semibold">La evidencia del buzón entra primero</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Los mensajes se almacenan incluso cuando quedan ignorados. Solo los remitentes aprobados
                    continúan hacia el parseo, la conciliación y la autorización exacta del pago.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-cyan-300" />
                      <p className="font-semibold">Ingesta con conciencia de autenticidad</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      DKIM, SPF, DMARC, los allowlists de remitentes y las banderas de desajuste producen evidencia, no confianza ciega.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-3">
                      <Workflow className="h-5 w-5 text-emerald-300" />
                      <p className="font-semibold">Conciliación explicable</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Referencia, monto, banco, ventana de tiempo, últimos cuatro dígitos y nombres contribuyen al puntaje y al estado.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-amber-300" />
                    <p className="font-semibold">La confirmación manual sigue siendo explícita</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    LedgerLink puede autorizar evidencia exacta, pero la plataforma conserva la trazabilidad del operador
                    y nunca finge que la liquidación es una verdad absoluta.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
