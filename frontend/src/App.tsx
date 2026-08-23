import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Clock3, Sparkles, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { DynamicBackground } from './components/DynamicBackground'
import { SearchBar } from './components/SearchBar'
import type { PlaceSuggestion } from './components/SearchBar'
import { PlacePreview, type PlaceDetails } from './components/PlacePreview'
import { SentimentChart } from './components/SentimentChart'
import { ReviewCard, type Review, type Sentiment } from './components/ReviewCard'


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

  const topBottomReviews = useMemo(() => {
    if (!resultData) return { top: [], bottom: [] }
    const positive = resultData.reviews
      .filter((review) => review.sentiment === 'Positive')
      .sort((a, b) => b.confidence - a.confidence)
    const negative = resultData.reviews
      .filter((review) => review.sentiment === 'Negative')
      .sort((a, b) => b.confidence - a.confidence)
    return { top: positive.slice(0, 5), bottom: negative.slice(0, 5) }
  }, [resultData])

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
  }

  return (
    <main className="min-h-screen relative bg-gray-50 dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 flex flex-col items-center pt-20 pb-24 font-sans transition-colors duration-500 selection:bg-google-blue/30 overflow-x-hidden">
      
      {/* Dynamic 3D Animated Background */}
      <DynamicBackground />

      {/* Theme Toggle */}
      <motion.button
        whileHover={{ scale: 1.1, rotate: 180 }}
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.3 }}
        type="button"
        onClick={() => setIsDark((value) => !value)}
        className="absolute top-6 right-6 p-3 rounded-full bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-lg hover:shadow-xl transition-all z-50"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.svg key="sun" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }} className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </motion.svg>
          ) : (
            <motion.svg key="moon" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }} className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center w-full max-w-3xl px-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center px-4 py-1.5 mb-8 text-xs font-bold uppercase tracking-widest rounded-full bg-white/60 dark:bg-white/10 text-gray-800 dark:text-gray-200 border border-white/50 dark:border-white/10 shadow-sm backdrop-blur-md"
        >
          <Sparkles className="w-4 h-4 mr-2 text-google-blue" /> AI-Powered Analysis
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="text-4xl sm:text-5xl md:text-7xl font-black mb-6 text-center tracking-tighter drop-shadow-sm flex flex-wrap justify-center gap-x-2"
        >
          <span className="whitespace-nowrap">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-google-blue to-blue-400">Geo</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-google-red to-red-400">Sen</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-google-yellow to-yellow-400">ti</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-google-blue to-blue-400">ment</span>
          </span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-google-green to-green-400">Analyzer</span>
        </motion.h1>

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
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-10 w-full max-w-lg bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/50 dark:border-white/10 p-6 rounded-3xl shadow-xl overflow-hidden relative"
            >
              {/* Animated scanning line */}
              <motion.div 
                className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-google-blue to-transparent"
                animate={{ y: [0, 150, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-google-blue font-bold tracking-wide">{statusText}</span>
                <span className="text-gray-500 font-bold">{progress}%</span>
              </div>
              <div
                className="w-full h-2.5 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden shadow-inner"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <motion.div 
                  className="h-full bg-gradient-to-r from-google-blue via-blue-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
              <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {reviewProgress && reviewProgress.total > 0 && (
                  <span>Reviews: {reviewProgress.current}/{reviewProgress.total}</span>
                )}
                <span className="flex items-center"><Clock3 className="w-3.5 h-3.5 mr-1.5 text-google-blue" /> {elapsedSeconds}s</span>
                {estimatedRemaining !== null && <span>ETA: {estimatedRemaining}s</span>}
              </div>
            </motion.div>
          )}

          {warningText && !isLoading && !errorMsg && (
            <motion.div 
              key="warning"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-8 p-4 bg-yellow-50/80 dark:bg-yellow-900/30 backdrop-blur-md border border-yellow-200/50 dark:border-yellow-700/50 rounded-2xl text-yellow-800 dark:text-yellow-300 text-sm font-medium shadow-lg w-full max-w-lg"
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
              className="mt-8 flex flex-col items-center p-6 bg-red-50/80 dark:bg-red-900/30 backdrop-blur-md border border-red-200/50 dark:border-red-700/50 rounded-3xl text-google-red w-full max-w-lg shadow-2xl shadow-red-500/10" 
              role="alert"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <ShieldAlert className="w-10 h-10 mb-3" />
              </motion.div>
              <p className="font-bold text-center text-lg">{errorMsg}</p>
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
            <div className="flex flex-col sm:flex-row items-center justify-between mb-12 bg-white/40 dark:bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 dark:border-white/10 shadow-lg">
              <div className="text-center sm:text-left">
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Analysis Results</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm font-medium">
                  {resultData.meta.analyzed_count} reviews analyzed using {resultData.meta.model_id}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={clearResults}
                className="mt-6 sm:mt-0 flex items-center px-8 py-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-bold rounded-full shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all"
              >
                Clear Results
              </motion.button>
            </div>

            {resultData.anomalies.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-10 bg-yellow-50/90 dark:bg-yellow-900/30 backdrop-blur-xl border border-yellow-200/50 dark:border-yellow-700/50 rounded-3xl p-6 sm:p-8 flex items-start shadow-xl shadow-yellow-500/5"
              >
                <ShieldAlert className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mr-5 shrink-0 mt-1 drop-shadow-sm" />
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-yellow-900 dark:text-yellow-300 tracking-tight">Potential Rating Anomalies ({resultData.anomalies.length})</h3>
                  <p className="text-yellow-700 dark:text-yellow-500 text-sm mt-1.5 font-medium">The star rating conflicts with the text sentiment. This is an AI indicator, not definitive proof of spam.</p>
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resultData.anomalies.slice(0, 3).map((review) => (
                      <div key={review.review_id ?? `${review.text}-${review.date}`} className="text-sm bg-white/80 dark:bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-yellow-100 dark:border-yellow-800/50 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-extrabold text-yellow-600">★ {review.rating ?? '—'}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 uppercase tracking-widest">AI: {review.sentiment}</span>
                        </div>
                        <span className="italic font-medium text-gray-700 dark:text-gray-300">“{review.text}”</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <div className="flex flex-col gap-10">
              <SentimentChart resultData={resultData} />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                <ReviewCard title="Top Positive" color="text-google-green" icon={<ThumbsUp className="w-7 h-7 mr-3 drop-shadow-sm" />} reviews={topBottomReviews.top} />
                <ReviewCard title="Top Complaints" color="text-google-red" icon={<ThumbsDown className="w-7 h-7 mr-3 drop-shadow-sm" />} reviews={topBottomReviews.bottom} />
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
