import presets from './presets.json'

export type Mode = 'light' | 'dark'
export type Theme = {
  id: string
  name: string
  source: string
  tokens: {
    theme: Record<string, string>
    light: Record<string, string>
    dark: Record<string, string>
  }
}
export const themes: Theme[] = presets
export const favoriteThemeIds = new Set(['graphite', 'clean-slate', 'mono'])
export function initialAppearance() {
  const params = new URLSearchParams(location.search)
  return {
    theme: themes.find((theme) => theme.id === params.get('theme')) ?? themes[0]!,
    mode: params.get('mode') === 'light' ? ('light' as const) : ('dark' as const),
  }
}

// Use published color, radius and shadow tokens verbatim. Keep typography and
// spacing fixed so the same collection remains easy to compare across presets.
const included = (key: string) => !/^(font-|tracking-|letter-spacing$|spacing$)/.test(key)
const tokenNames = new Set(
  themes.flatMap((theme) =>
    Object.values(theme.tokens).flatMap((tokens) => Object.keys(tokens).filter(included)),
  ),
)
export function applyAppearance(theme: Theme, mode: Mode) {
  const root = document.documentElement
  tokenNames.forEach((key) => root.style.removeProperty(`--${key}`))
  Object.entries({ ...theme.tokens.theme, ...theme.tokens[mode] })
    .filter(([key]) => included(key))
    .forEach(([key, value]) => root.style.setProperty(`--${key}`, value))
  root.dataset.theme = theme.id
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
  const url = new URL(location.href)
  url.searchParams.set('theme', theme.id)
  url.searchParams.set('mode', mode)
  history.replaceState(null, '', url)
}
