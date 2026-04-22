import Link from 'next/link';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Acceso de operador</CardTitle>
          <CardDescription>
            Entra al espacio de LedgerLink y configura el flujo de evidencia con Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este MVP asume un entorno controlado de operador. OAuth para Gmail lo maneja el backend y los
            tokens permanecen del lado del servidor.
          </p>
          <div className="flex gap-3">
            <Link href="/companies/default/dashboard">
              <Button>Abrir panel</Button>
            </Link>
            <Link href="/companies/default/settings/gmail">
              <Button variant="secondary">Configurar Gmail</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
