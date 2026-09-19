import { useState, type CSSProperties } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Moon, Search, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './ui/popover'
import { themes, favoriteThemeIds, type Theme, type Mode } from './themes'

function Swatches({ theme, mode }: { theme: Theme; mode: Mode }) {
  return (
    <span className="theme-swatches" aria-hidden="true">
      {['background', 'primary', 'accent', 'foreground'].map((token) => (
        <i key={token} style={{ background: theme.tokens[mode][token] } as CSSProperties} />
      ))}
    </span>
  )
}

export function ThemePicker({
  theme,
  mode,
  onTheme,
  onMode,
}: {
  theme: Theme
  mode: Mode
  onTheme: (theme: Theme) => void
  onMode: (mode: Mode) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const index = themes.findIndex((value) => value.id === theme.id)
  const options = themes.filter((value) => value.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="appearance-controls">
      <div className="theme-controls">
        <div className="theme-cycle">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous theme"
            onClick={() => onTheme(themes[(index + themes.length - 1) % themes.length]!)}
          >
            <ChevronLeft />
          </Button>
          <Popover
            open={open}
            onOpenChange={(value) => {
              setOpen(value)
              if (!value) setSearch('')
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="theme-picker-trigger"
                  aria-label={`Choose theme: ${theme.name}`}
                />
              }
            >
              <Swatches theme={theme} mode={mode} />
              <span>{theme.name}</span>
              <ChevronDown />
            </PopoverTrigger>
            <PopoverContent align="end" className="theme-picker-panel">
              <div className="theme-picker-title">
                <PopoverTitle>Themes</PopoverTitle>
                <span>{themes.length} from tweakcn</span>
              </div>
              <label className="theme-search">
                <Search />
                <input
                  autoFocus
                  aria-label="Search themes"
                  placeholder="Search themes…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="theme-grid" aria-label="Available themes">
                {options.map((option) => (
                  <button
                    key={option.id}
                    aria-pressed={theme.id === option.id}
                    onClick={() => {
                      onTheme(option)
                      setOpen(false)
                      setSearch('')
                    }}
                  >
                    <Swatches theme={option} mode={mode} />
                    <span>
                      {option.name}
                      {favoriteThemeIds.has(option.id) && <small>Your pick</small>}
                    </span>
                    {theme.id === option.id && <Check />}
                  </button>
                ))}
                {!options.length && <p>No matching themes.</p>}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next theme"
            onClick={() => onTheme(themes[(index + 1) % themes.length]!)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="mode-switch" role="group" aria-label="Appearance">
          <Button variant="ghost" aria-pressed={mode === 'light'} onClick={() => onMode('light')}>
            <Sun />
            Light
          </Button>
          <Button variant="ghost" aria-pressed={mode === 'dark'} onClick={() => onMode('dark')}>
            <Moon />
            Dark
          </Button>
        </div>
      </div>
      <div className="theme-provenance">
        <span>
          {index + 1} / {themes.length} · Restrained application · Fixed typography
        </span>
        <a href={theme.source} target="_blank" rel="noreferrer">
          Theme source ↗
        </a>
      </div>
    </div>
  )
}
