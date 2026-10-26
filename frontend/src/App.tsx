import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Clock3, ShieldAlert, Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { DynamicBackground } from './components/DynamicBackground'
import { SearchBar } from './components/SearchBar'
import type { PlaceSuggestion } from './components/SearchBar'
import { PlacePreview, type PlaceDetails } from './components/PlacePreview'
import { AnalyticsKPIHeader } from './components/AnalyticsKPIHeader'
import { SentimentChart } from './components/SentimentChart'
import { ReviewExplorer } from './components/ReviewExplorer'
import type { Review, Sentiment } from './components/ReviewCard'


type Stats = Record<Sentiment, number>
export type Keyword = { text: string; value: number }

export type ResultData = {
  status: 'Complete'
  stats: Stats
  reviews: Review[]
  anomalies: Review[]
  keywords: Keyword[]
  keyword_groups?: {
    positive: Keyword[]
    negative: Keyword[]
  }
  meta: {
    analyzed_count: number
    requested_count: number
    model_id: string
    translation_model_id?: string
    translated_review_count?: number
    source: string
    stateless: boolean
  }
}

type StreamMessage = {
  status?: string
  stage?: string
  progress?: number
  current?: number
  total?: number
  warning?: boolean
  error?: boolean
  code?: string
  stats?: Stats
  reviews?: Review[]
  anomalies?: Review[]
  keywords?: Keyword[]
  keyword_groups?: ResultData['keyword_groups']
  meta?: ResultData['meta']
  place?: PlaceDetails
}

function isResultData(value: StreamMessage): value is StreamMessage & ResultData {
  return (
    value.status === 'Complete' &&
    value.stats !== undefined &&
    Array.isArray(value.reviews) &&
    Array.isArray(value.anomalies) &&
    Array.isArray(value.keywords) &&
    value.meta !== undefined
  )
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const apiUrl = (path: string) => `${API_BASE_URL}${path}`
const apiHeaders = API_BASE_URL.includes('.ngrok')
  ? { 'ngrok-skip-browser-warning': 'true' }
  : undefined

const buildAnalyzeUrl = (input: string) =>
  apiUrl(`/api/analyze?url=${encodeURIComponent(input)}`)

function isMapsUrl(value: string): boolean {
  let candidate = value.trim()
  if (/^(?:www\.|maps\.)?google\./i.test(candidate)) {
    candidate = `https://${candidate}`
  } else if (/^(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    const hostname = parsed.hostname.toLowerCase()
    if (parsed.protocol !== 'https:') return false
    if (hostname === 'maps.app.goo.gl') return true
    if (hostname === 'goo.gl') return parsed.pathname.startsWith('/maps')
    const googleHosts = new Set([
      'google.com', 'www.google.com', 'maps.google.com', 'google.co.id',
      'www.google.co.id', 'maps.google.co.id', 'google.co.uk', 'www.google.co.uk',
      'maps.google.co.uk', 'google.com.au', 'www.google.com.au', 'maps.google.com.au',
      'google.ca', 'www.google.ca', 'maps.google.ca', 'google.de', 'www.google.de',
      'maps.google.de', 'google.fr', 'www.google.fr', 'maps.google.fr', 'google.co.jp',
      'www.google.co.jp', 'maps.google.co.jp', 'google.co.kr', 'www.google.co.kr',
      'maps.google.co.kr', 'google.com.sg', 'www.google.com.sg', 'maps.google.com.sg',
      'google.com.my', 'www.google.com.my', 'maps.google.com.my',
    ])
    return googleHosts.has(hostname) && parsed.pathname.includes('/maps')
  } catch {
    return false
  }
}

function App() {
  const [input, setInput] = useState('')
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('geosentiment-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [warningText, setWarningText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  const placesAbortControllerRef = useRef<AbortController | null>(null)
  const placesSessionTokenRef = useRef(crypto.randomUUID())
  const isFinishedRef = useRef(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('geosentiment-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    if (!isLoading) return
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      placesAbortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const query = input.trim()
    placesAbortControllerRef.current?.abort()
    setSuggestionsError('')
    if (isLoading || query.length < 3 || isMapsUrl(query)) {
      setSuggestions([])
      setSuggestionsLoading(false)
      return
    }

    const controller = new AbortController()
    placesAbortControllerRef.current = controller
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      try {
        const params = new URLSearchParams({
          q: query,
          session_token: placesSessionTokenRef.current,
        })
        const response = await fetch(apiUrl(`/api/places/autocomplete?${params}`), {
          headers: apiHeaders,
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Place search failed')
        const payload = await response.json() as { suggestions?: PlaceSuggestion[] }
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : [])
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSuggestions([])
        setSuggestionsError('Place search is temporarily unavailable. You can still paste a Google Maps link.')
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [input, isLoading])

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    placesAbortControllerRef.current?.abort()
    const controller = new AbortController()
    placesAbortControllerRef.current = controller
    setSuggestions([])
    setSuggestionsLoading(true)
    setSuggestionsError('')
    try {
      const params = new URLSearchParams({
        session_token: placesSessionTokenRef.current,
        name: suggestion.main_text,
        address: suggestion.secondary_text,
      })
      if (typeof suggestion.latitude === 'number') params.set('lat', String(suggestion.latitude))
      if (typeof suggestion.longitude === 'number') params.set('lon', String(suggestion.longitude))
      const response = await fetch(
        apiUrl(`/api/places/details/${encodeURIComponent(suggestion.place_id)}?${params}`),
        { headers: apiHeaders, signal: controller.signal },
      )
      if (!response.ok) throw new Error('Place details failed')
      const place = await response.json() as PlaceDetails
      setSelectedPlace(place)
      setInput(place.analysis_value)
      placesSessionTokenRef.current = crypto.randomUUID()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSuggestionsError('Place details could not be loaded. Try pasting its Google Maps link instead.')
    } finally {
      if (!controller.signal.aborted) setSuggestionsLoading(false)
    }
  }

  const estimatedRemaining = useMemo(() => {
    if (!isLoading || progress < 5 || progress >= 100 || elapsedSeconds < 2) return null
    return Math.max(0, Math.round((elapsedSeconds * (100 - progress)) / progress))
  }, [elapsedSeconds, isLoading, progress])


  const closeStream = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  const cancelAnalysis = () => {
    isFinishedRef.current = true
    closeStream()
    setIsLoading(false)
    setStatusText('')
    setErrorMsg('Analysis cancelled.')
  }

  const startAnalysis = (event?: FormEvent) => {
    event?.preventDefault()
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return
    if (!isMapsUrl(trimmedInput)) {
      setErrorMsg('Choose a place suggestion or paste an official Google Maps place link.')
      setSelectedPlace(null)
      return
    }

    closeStream()
    setIsLoading(true)
    setErrorMsg('')
    setWarningText('')
    setStatusText('Connecting to the server...')
    setResultData(null)
    setProgress(0)
    setReviewProgress(null)
    setElapsedSeconds(0)
    setSelectedPlace(null)
    setSelectedKeyword(null)
    isFinishedRef.current = false

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    fetch(buildAnalyzeUrl(trimmedInput), {
      headers: apiHeaders,
      signal: abortController.signal
    }).then(async (response) => {
      if (!response.ok) throw new Error('Network error')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No readable stream')
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim()
            try {
              const data = JSON.parse(dataStr) as StreamMessage

              if (data.status) setStatusText(data.status)
              if (typeof data.progress === 'number') {
                setProgress(Math.max(0, Math.min(100, data.progress)))
              }
              if (typeof data.current === 'number' && typeof data.total === 'number') {
                setReviewProgress({ current: data.current, total: data.total })
              }
              if (data.warning && data.status) setWarningText(data.status)
              if (data.place) setSelectedPlace(data.place)

              if (data.error) {
                isFinishedRef.current = true
                setErrorMsg(data.status || 'An error occurred while processing the data.')
                setIsLoading(false)
                closeStream()
                return
              }

              if (isResultData(data)) {
                isFinishedRef.current = true
                setResultData(data)
                setProgress(100)
                setIsLoading(false)
                closeStream()
              }
            } catch (error) {
              console.error('Invalid SSE response:', error)
              isFinishedRef.current = true
              setErrorMsg('The server returned an unreadable response.')
              setIsLoading(false)
              closeStream()
            }
          }
        }
      }
    }).catch((error) => {
      if (error.name !== 'AbortError' && !isFinishedRef.current) {
        setErrorMsg('Backend connection failed. Make sure the backend is running on port 8001.')
        setIsLoading(false)
      }
      closeStream()
    })
  }

  const clearResults = () => {
    setResultData(null)
    setSelectedPlace(null)
    setInput('')
    setProgress(0)
    setElapsedSeconds(0)
    setStatusText('')
    setWarningText('')
    setErrorMsg('')
    setReviewProgress(null)
    setSelectedKeyword(null)
  }

  return (
    <main className="min-h-screen relative bg-gray-50 dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 flex flex-col items-center pt-20 pb-24 font-sans transition-colors duration-500 selection:bg-google-blue/30 overflow-x-hidden">
      
      {/* Dynamic 3D Animated Background */}
      <DynamicBackground />

      {/* Theme Toggle */}
      <button
        type="button"
        onClick={() => setIsDark((value) => !value)}
        className="absolute top-6 right-6 p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-subtle hover:shadow-elevated transition-all z-50 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div key="sun" initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: 0.15 }}>
              <Sun className="w-5 h-5 text-amber-400" />
            </motion.div>
          ) : (
            <motion.div key="moon" initial={{ opacity: 0, rotate: 30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -30 }} transition={{ duration: 0.15 }}>
              <Moon className="w-5 h-5 text-slate-700" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center w-full max-w-3xl px-4 text-center">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1 mb-5 text-xs font-semibold rounded-full bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 shadow-subtle backdrop-blur-md"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Location Review & Sentiment Intelligence
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-3 tracking-tight text-slate-900 dark:text-white"
        >
          GeoSentiment <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500 dark:from-blue-400 dark:to-teal-300">Analyzer</span>
        </motion.h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mb-7 leading-relaxed">
          Extract actionable customer sentiment, rating discrepancies, and multilingual feedback from Google Maps reviews.
        </p>

        <SearchBar 
          input={input} 
          setInput={setInput} 
          isLoading={isLoading} 
          startAnalysis={startAnalysis} 
          cancelAnalysis={cancelAnalysis} 
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          suggestionsError={suggestionsError}
          selectSuggestion={selectSuggestion}
        />

        <AnimatePresence mode="popLayout">
          {selectedPlace && (
            <PlacePreview key="place-preview" place={selectedPlace} />
          )}

          {isLoading && (
            <motion.div 
              key="loading-status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-8 w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 p-6 rounded-2xl sm:rounded-3xl shadow-elevated dark:shadow-elevated-dark overflow-hidden text-left"
            >
              <div className="flex items-center justify-between text-xs sm:text-sm mb-2.5">
                <span className="text-slate-800 dark:text-slate-200 font-bold tracking-tight flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  {statusText || 'Processing location data...'}
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{progress}%</span>
              </div>

              <div
                className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <motion.div 
                  className="h-full bg-gradient-to-r from-blue-600 to-teal-500 dark:from-blue-500 dark:to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              </div>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {reviewProgress && reviewProgress.total > 0 && (
                  <span>Reviews extracted: {reviewProgress.current} / {reviewProgress.total}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock3 className="w-3 h-3 text-blue-500" /> {elapsedSeconds}s elapsed
                </span>
                {estimatedRemaining !== null && <span>ETA: ~{estimatedRemaining}s</span>}
              </div>
            </motion.div>
          )}

          {warningText && !isLoading && !errorMsg && (
            <motion.div 
              key="warning"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 p-4 bg-amber-50/90 dark:bg-amber-950/40 backdrop-blur-md border border-amber-200/80 dark:border-amber-800/50 rounded-2xl text-amber-800 dark:text-amber-200 text-xs sm:text-sm font-medium shadow-subtle w-full max-w-lg text-left"
            >
              {warningText}
            </motion.div>
          )}

          {errorMsg && !isLoading && (
            <motion.div 
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 flex items-start gap-3.5 p-4 sm:p-5 bg-rose-50/90 dark:bg-rose-950/40 backdrop-blur-md border border-rose-200/80 dark:border-rose-800/50 rounded-2xl text-rose-800 dark:text-rose-200 w-full max-w-lg shadow-elevated text-left" 
              role="alert"
            >
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-rose-900 dark:text-rose-100">Notice</p>
                <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Results Section */}
      <AnimatePresence>
        {resultData && !isLoading && (
          <motion.section 
            key="results"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, type: 'spring' }}
            className="relative z-10 w-full max-w-[85rem] mt-12 sm:mt-24 px-4 sm:px-8 mb-24"
          >
            <AnalyticsKPIHeader 
              resultData={resultData} 
              place={selectedPlace} 
              onClear={clearResults} 
            />

            <div className="flex flex-col gap-8">
              <SentimentChart 
                resultData={resultData} 
                selectedKeyword={selectedKeyword}
                onSelectKeyword={setSelectedKeyword}
              />

              <ReviewExplorer
                reviews={resultData.reviews}
                anomalies={resultData.anomalies}
                selectedKeyword={selectedKeyword}
                onClearKeyword={() => setSelectedKeyword(null)}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
