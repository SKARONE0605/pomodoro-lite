import * as React from 'react'
import { cn } from '@/lib/utils'

interface AuroraButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children: React.ReactNode
  glowClassName?: string
}

export function AuroraButton({
  className,
  children,
  glowClassName,
  ...props
}: AuroraButtonProps) {
  return (
    // outer div carries 'group' so sibling glow reacts to hover
    <div className="relative group">
      {/* Animated gradient glow */}
      <div
        className={cn(
          'absolute -inset-[2px] rounded-full bg-gradient-to-r from-purple-500 via-cyan-300 to-emerald-400 opacity-75 blur-lg transition-all duration-300',
          'group-hover:opacity-100 group-hover:blur-xl',
          glowClassName,
        )}
      />
      {/* Button */}
      <button
        className={cn(
          'relative rounded-full bg-slate-950/90',
          'text-slate-100 shadow-xl',
          'transition-all hover:bg-slate-950/70',
          'border border-slate-800',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </div>
  )
}
