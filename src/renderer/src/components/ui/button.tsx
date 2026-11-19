import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.975] cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-105 shadow-apple-subtle',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-105 shadow-apple-subtle',
        outline:
          'border border-border/80 bg-card text-foreground hover:bg-surface shadow-apple-subtle apple-card-elevated',
        secondary:
          'bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/50 shadow-2xs',
        ghost: 'hover:bg-surface hover:text-foreground text-muted-foreground',
        link: 'text-accent underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 text-[13px]',
        sm: 'h-8 rounded-lg px-3 text-[12px]',
        lg: 'h-10 rounded-xl px-6 text-[14px]',
        icon: 'h-8 w-8 rounded-lg'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button }
