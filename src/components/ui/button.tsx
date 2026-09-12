import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  // Pill-shaped (rounded-full) rather than rounded-md — the single biggest
  // lever for a warm/friendly feel on the most-repeated element on the site.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-wide transition-all duration-300 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-soft hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-card active:translate-y-0 active:scale-[0.97]',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.97]',
        outline:
          'border border-border bg-transparent text-foreground hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-[0.97]',
        ghost: 'bg-transparent text-foreground hover:bg-muted active:scale-[0.97]',
        link: 'px-0 text-foreground underline-offset-4 hover:underline',
        // The conversion CTA — ember orange, reserved for add-to-cart/checkout.
        cta: 'bg-gradient-ember text-white shadow-card hover:-translate-y-0.5 hover:shadow-pop hover:brightness-105 active:translate-y-0 active:scale-[0.97]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.97]',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-6 text-sm',
        lg: 'h-12 px-8 text-sm',
        xl: 'h-14 px-10 text-base',
        icon: 'h-10 w-10',
      },
      uppercase: {
        true: 'uppercase tracking-[0.14em]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, uppercase, asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const buttonClassName = cn(buttonVariants({ variant, size, uppercase }), className);

  // When asChild is true, Slot uses React.Children.only — so we MUST forward
  // exactly one child. Skip the loading spinner injection in that case.
  if (asChild) {
    return (
      <Comp ref={ref} className={buttonClassName} {...props}>
        {children}
      </Comp>
    );
  }

  return (
    <button ref={ref} className={buttonClassName} disabled={disabled || loading} {...props}>
      {loading ? (
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {children}
    </button>
  );
});

export { buttonVariants };
