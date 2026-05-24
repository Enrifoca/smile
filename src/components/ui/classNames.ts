export function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
