import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { joinClasses } from './classNames'

export interface FieldProps {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={joinClasses('ui-field-group', className)}>
      {label && <label className="ui-field-label">{label}</label>}
      {children}
      {hint && <p className="ui-field-hint">{hint}</p>}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={joinClasses('ui-field', className)} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={joinClasses('ui-field ui-field--textarea', className)} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={joinClasses('ui-field', className)}>
      {children}
    </select>
  )
}
