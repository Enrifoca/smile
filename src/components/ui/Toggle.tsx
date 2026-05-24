import { InputHTMLAttributes } from 'react'
import { joinClasses } from './classNames'

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

export function Toggle({ label, className, ...props }: ToggleProps) {
  return (
    <label
      className={joinClasses('ui-toggle', className)}
      title={label}
    >
      <input type="checkbox" {...props} />
      <span className="ui-toggle-thumb" aria-hidden="true" />
    </label>
  )
}
