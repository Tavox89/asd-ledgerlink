import * as React from 'react';

import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-xl border border-border bg-white/90 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary dark:bg-slate-950/70',
        className,
      )}
      {...props}
    />
  );
}
