import type { ButtonHTMLAttributes } from 'react';
const variants = {
  primary: 'bg-moss text-black hover:bg-ink',
  secondary: 'border border-line bg-mist text-ink hover:border-muted',
  ghost: 'text-muted hover:bg-mist hover:text-ink',
} as const;
export function Button({variant='secondary',className='',...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: keyof typeof variants}) {
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss ${variants[variant]} ${className}`} />;
}
