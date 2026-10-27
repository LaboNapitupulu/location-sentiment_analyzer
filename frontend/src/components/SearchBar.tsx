import { useState, useRef, useEffect } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MapPin, LoaderCircle, Search, X, Compass } from 'lucide-react'
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

        {/* Google Signature Rounded-Full Search Bar */}
        <div
          className={cn(
            "relative flex items-center bg-white dark:bg-[#303134] rounded-full transition-all duration-200 px-5 py-3 border",
            isLoading
              ? "border-[#4285F4] ring-2 ring-[#4285F4]/30 shadow-lg"
              : "border-[#dfe1e5] dark:border-[#5f6368] shadow-[0_1px_6px_rgba(32,33,36,0.2)] hover:shadow-[0_1px_6px_rgba(32,33,36,0.35)] focus-within:shadow-[0_1px_6px_rgba(32,33,36,0.35)] focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#4285F4]/40"
          )}
        >
          <div className="mr-3 text-[#4285F4] shrink-0">
            {isLoading ? (
              <LoaderCircle className="w-5 h-5 animate-spin text-[#4285F4]" />
            ) : (
              <MapPin className="w-5 h-5 text-[#4285F4]" />
            )}
          </div>

          <input
            ref={inputRef}
            id="location-input"
            type="text"
            placeholder="Search on Google Maps (e.g. Grand Indonesia) or paste link..."
            className="flex-1 min-w-0 bg-transparent text-[#202124] dark:text-[#e8eaed] placeholder:text-[#80868b] dark:placeholder:text-[#9aa0a6] text-sm sm:text-base outline-none disabled:opacity-50 font-normal"
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
              className="p-1 rounded-full text-[#80868b] hover:text-[#202124] dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors mr-2"
              aria-label="Clear search input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {isLoading ? (
            <button
              type="button"
              onClick={cancelAnalysis}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#fce8e6] dark:bg-[#5c2b29] text-[#c5221f] dark:text-[#f28b82] text-xs font-semibold hover:bg-[#fad2cf] transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 disabled:hover:bg-[#1a73e8] text-white text-xs sm:text-sm font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>
          )}
        </div>

        {/* Suggestion dropdown with Google Material styling */}
        <AnimatePresence>
          {!isLoading && (suggestionsLoading || suggestions.length > 0 || suggestionsError) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-[#dfe1e5] bg-white text-left shadow-2xl dark:border-[#5f6368] dark:bg-[#303134] z-50 max-h-80 overflow-y-auto"
            >
              {suggestionsLoading && (
                <div className="flex items-center gap-2.5 px-4 py-3.5 text-xs sm:text-sm text-[#5f6368] dark:text-[#9aa0a6]">
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#4285F4]" />
                  <span>Searching Google Places…</span>
                </div>
              )}

              {!suggestionsLoading && suggestionsError && (
                <div className="px-4 py-3 text-xs sm:text-sm text-[#c5221f] dark:text-[#f28b82] bg-[#fce8e6]/50 dark:bg-[#5c2b29]/40">
                  {suggestionsError}
                </div>
              )}

              {!suggestionsLoading && suggestions.length > 0 && (
                <ul
                  ref={listRef}
                  role="listbox"
                  aria-label="Google Place suggestions"
                  className="divide-y divide-[#f1f3f4] dark:divide-[#3c4043] py-1"
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
                              ? "bg-[#e8f0fe] dark:bg-[#3c4043] text-[#1a73e8] dark:text-[#8ab4f8]"
                              : "hover:bg-[#f8f9fa] dark:hover:bg-[#3c4043]/60 text-[#202124] dark:text-[#e8eaed]"
                          )}
                        >
                          <MapPin className={cn(
                            "mt-0.5 h-4 w-4 shrink-0 transition-colors",
                            isSelected ? "text-[#1a73e8] dark:text-[#8ab4f8]" : "text-[#80868b]"
                          )} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {suggestion.main_text}
                            </span>
                            {suggestion.secondary_text && (
                              <span className="mt-0.5 block truncate text-xs text-[#5f6368] dark:text-[#9aa0a6]">
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

      {/* Quick Demo Place Presets - Google style pill chips */}
      {!isLoading && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 px-1">
          <span className="text-xs font-medium text-[#80868b] dark:text-[#9aa0a6] flex items-center mr-1">
            <Compass className="w-3.5 h-3.5 mr-1 text-[#4285F4]" /> Quick test:
          </span>
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setInput(preset.query)
                inputRef.current?.focus()
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-white dark:bg-[#303134] hover:bg-[#f8f9fa] dark:hover:bg-[#3c4043] text-[#3c4043] dark:text-[#e8eaed] border border-[#dadce0] dark:border-[#5f6368] transition-colors shadow-sm"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
