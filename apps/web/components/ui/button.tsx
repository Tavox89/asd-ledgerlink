import * as React from 'react';

import { cn } from '../../lib/utils';

const buttonVariants = {
  default:
    'bg-primary text-primary-foreground hover:opacity-95 shadow-panel border border-white/10',
  secondary:
    'bg-white/70 text-slate-900 hover:bg-white dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900',
  ghost:
    'bg-transparent text-foreground hover:bg-slate-100 dark:hover:bg-slate-900/70 border border-transparent',
  outline:
    'border border-border bg-transparent text-foreground hover:bg-slate-50 dark:hover:bg-slate-900/70',
  destructive:
    'bg-danger text-white hover:opacity-95',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
