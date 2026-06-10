/**
 * Derive a filesystem-safe slug from a human-readable context name.
 * Collisions are resolved by the caller (append -2, -3, …).
 */
export function slugifyContextName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  const slug = trimmed
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug.toLowerCase()
}

export function resolveUniqueSlug(baseSlug: string, taken: Set<string>): string {
  if (!taken.has(baseSlug)) return baseSlug
  let index = 2
  while (taken.has(`${baseSlug}-${index}`)) index += 1
  return `${baseSlug}-${index}`
}
