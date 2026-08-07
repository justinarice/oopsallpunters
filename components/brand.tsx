import { cn } from '@/lib/utils'
import { SportShoe } from 'lucide-react';

/**
 * Brand mark: a stylized punt arc inside a rounded badge, plus the wordmark.
 * Sleeper-inspired feel without copying any Sleeper assets.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <SportShoe />
    </span>
  )
}

export function Wordmark({
  className,
  subtitle = true,
}: {
  className?: string
  subtitle?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">
          Oops All Punters
        </span>
        {subtitle && (
          <span className="text-[11px] font-medium text-muted-foreground">
            Sleeper Companion
          </span>
        )}
      </span>
    </span>
  )
}
