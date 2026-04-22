import { Card, CardContent } from './card';

export function LoadingCard({ label = 'Cargando datos...' }: { label?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}
