import { cn } from '@/lib/utils'

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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="M3 20c4-11 14-11 18 0" />
        <circle cx="3" cy="20" r="1.4" fill="currentColor" stroke="none" />
        <path d="M14.5 5.5l4 4" />
      </svg>
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
