import { useState, useRef, useEffect } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MapPin, LoaderCircle, Search, X, Sparkles, Compass } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'

export type PlaceSuggestion = {
  place_id: string
  text: string
  main_text: string
  secondary_text: string
  latitude?: number
  longitude?: number
}

type SearchBarProps = {
  input: string
  setInput: (value: string) => void
  isLoading: boolean
  startAnalysis: (e?: FormEvent) => void
  cancelAnalysis: () => void
  suggestions: PlaceSuggestion[]
  suggestionsLoading: boolean
  suggestionsError: string
  selectSuggestion: (suggestion: PlaceSuggestion) => void
}

const DEMO_PRESETS = [
  { label: 'Grand Indonesia Mall', query: 'Grand Indonesia, Jakarta' },
  { label: 'Monas', query: 'Monumen Nasional, Jakarta' },
  { label: 'Kopi Kenangan Senayan', query: 'Kopi Kenangan Senayan City' },
  { label: 'Candi Borobudur', query: 'Candi Borobudur, Magelang' },
]

export function SearchBar({
  input,
  setInput,
  isLoading,
  startAnalysis,
  cancelAnalysis,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  selectSuggestion,
}: SearchBarProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset keyboard highlight on new suggestions
  useEffect(() => {
    setSelectedIndex(-1)
  }, [suggestions])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setSelectedIndex(-1)
    }
  }

  const handleClear = () => {
    setInput('')
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div className="w-full relative z-20 max-w-2xl mx-auto">
      <form onSubmit={startAnalysis} className="relative">
        <label htmlFor="location-input" className="sr-only">
          Google Maps link or venue name
        </label>

        <div
          className={cn(
            "relative flex items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border transition-all duration-300 px-5 py-3.5 shadow-elevated dark:shadow-elevated-dark",
            isLoading
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
          )}
        >
          <div className="mr-3 text-blue-600 dark:text-blue-400 shrink-0">
            {isLoading ? (
              <LoaderCircle className="w-5 h-5 animate-spin" />
            ) : (
              <MapPin className="w-5 h-5" />
            )}
          </div>

          <input
            ref={inputRef}
            id="location-input"
            type="text"
            placeholder="Search venue name (e.g. Grand Indonesia) or paste Maps URL..."
            className="flex-1 min-w-0 bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm sm:text-base outline-none disabled:opacity-50 font-normal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            maxLength={2048}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
          />

          {input.length > 0 && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mr-2"
              aria-label="Clear search input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {isLoading ? (
            <button
              type="button"
              onClick={cancelAnalysis}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <Search className="w-4 h-4" />
              <span>Analyze</span>
            </button>
          )}
        </div>

        {/* Suggestion dropdown with accessible listbox */}
        <AnimatePresence>
          {!isLoading && (suggestionsLoading || suggestions.length > 0 || suggestionsError) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-left shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 z-50 max-h-80 overflow-y-auto"
            >
              {suggestionsLoading && (
                <div className="flex items-center gap-2.5 px-4 py-3.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />
                  <span>Searching location database…</span>
                </div>
              )}

              {!suggestionsLoading && suggestionsError && (
                <div className="px-4 py-3 text-xs sm:text-sm text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30">
                  {suggestionsError}
                </div>
              )}

              {!suggestionsLoading && suggestions.length > 0 && (
                <ul
                  ref={listRef}
                  role="listbox"
                  aria-label="Location suggestions"
                  className="divide-y divide-slate-100 dark:divide-slate-800/80 py-1"
                >
                  {suggestions.map((suggestion, index) => {
                    const isSelected = selectedIndex === index
                    return (
                      <li key={suggestion.place_id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => selectSuggestion(suggestion)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                            isSelected
                              ? "bg-blue-50/90 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                          )}
                        >
                          <MapPin className={cn(
                            "mt-0.5 h-4 w-4 shrink-0 transition-colors",
                            isSelected ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
                          )} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {suggestion.main_text}
                            </span>
                            {suggestion.secondary_text && (
                              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                                {suggestion.secondary_text}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Quick Demo Place Presets */}
      {!isLoading && (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-1">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center mr-1">
            <Compass className="w-3 h-3 mr-1" /> Quick test:
          </span>
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setInput(preset.query)
                inputRef.current?.focus()
              }}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-200/50 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
