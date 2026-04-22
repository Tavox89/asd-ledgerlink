import * as React from 'react';

import { cn } from '../../lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-white/90 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary dark:bg-slate-950/70',
        className,
      )}
      {...props}
    />
  );
}
