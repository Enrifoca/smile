import { ButtonHTMLAttributes, ReactNode } from 'react'
import { joinClasses } from './classNames'
import type { ButtonSize, ButtonVariant } from './types'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Loading...',
  disabled,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      className={joinClasses(
        'ui-btn',
        `ui-btn--${variant}`,
        `ui-btn--${size}`,
        className,
      )}
    >
      {loading ? loadingLabel : children}
    </button>
  )
}
