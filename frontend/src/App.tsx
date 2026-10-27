import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { FormEvent } from 'react'
import { Clock3, ShieldAlert, Sun, Moon, Server, X } from 'lucide-react'
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

const getInitialApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const apiParam = params.get('api')
    if (apiParam) {
      const cleaned = apiParam.trim().replace(/\/+$/, '')
      try {
        localStorage.setItem('geosentiment-api-base-url', cleaned)
      } catch {
        // ignore
      }
      return cleaned
    }
    const saved = localStorage.getItem('geosentiment-api-base-url')
    if (saved !== null) return saved.trim().replace(/\/+$/, '')
  }
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

function App() {
  const [input, setInput] = useState('')
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('geosentiment-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(getInitialApiBaseUrl)
  const [serverModalOpen, setServerModalOpen] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState(apiBaseUrl)
  const [shareCopied, setShareCopied] = useState(false)

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

  const isRemoteHost = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1'

  const apiUrl = useCallback((path: string) => `${apiBaseUrl}${path}`, [apiBaseUrl])
  const apiHeaders = useMemo(() => apiBaseUrl.includes('.ngrok')
    ? { 'ngrok-skip-browser-warning': 'true' }
    : undefined, [apiBaseUrl])

  const buildAnalyzeUrl = (queryInput: string) =>
    apiUrl(`/api/analyze?url=${encodeURIComponent(queryInput)}`)

  const handleSaveServerUrl = () => {
    const cleaned = serverUrlInput.trim().replace(/\/+$/, '')
    setApiBaseUrl(cleaned)
    localStorage.setItem('geosentiment-api-base-url', cleaned)
    setServerModalOpen(false)
    setErrorMsg('')
  }

  const handleResetServerUrl = () => {
    setApiBaseUrl('')
    setServerUrlInput('')
    localStorage.removeItem('geosentiment-api-base-url')
    setServerModalOpen(false)
    setErrorMsg('')
  }

  const copyShareLink = async () => {
    const targetUrl = apiBaseUrl || serverUrlInput.trim().replace(/\/+$/, '')
    const url = targetUrl
      ? `${window.location.origin}/?api=${encodeURIComponent(targetUrl)}`
      : window.location.origin
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // fallback
    }
  }

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
  }, [input, isLoading, apiUrl, apiHeaders])

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
    setStatusText('Connecting to Google Maps scraper & NLP server...')
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
                setErrorMsg(data.status || 'An error occurred while processing reviews.')
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
    <main className="min-h-screen relative bg-white dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] flex flex-col items-center pt-16 pb-24 font-sans transition-colors duration-300 selection:bg-[#4285F4]/20 selection:text-[#1a73e8] overflow-x-hidden">
      
      {/* Google Ambient Halo Background */}
      <DynamicBackground />

      {/* Top Navigation Bar: Server Settings & Theme Toggle */}
      <div className="absolute top-5 right-6 flex items-center gap-2.5 z-50">
        <button
          type="button"
          onClick={() => {
            setServerUrlInput(apiBaseUrl)
            setServerModalOpen(true)
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#303134] border border-[#dadce0] dark:border-[#5f6368] shadow-sm hover:shadow-md transition-all text-xs font-semibold text-[#3c4043] dark:text-[#bdc1c6]"
          title="Configure backend server URL"
        >
          <Server className="w-3.5 h-3.5 text-[#4285F4]" />
          <span className="hidden sm:inline">
            {apiBaseUrl ? 'Tunnel API' : 'Backend: Localhost'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsDark((value) => !value)}
          className="p-2 rounded-full bg-white dark:bg-[#303134] border border-[#dadce0] dark:border-[#5f6368] shadow-sm hover:shadow-md transition-all text-[#3c4043] dark:text-[#bdc1c6]"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <AnimatePresence mode="wait">
            {isDark ? (
              <motion.div key="sun" initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: 0.15 }}>
                <Sun className="w-4 h-4 text-[#FBBC05]" />
              </motion.div>
            ) : (
              <motion.div key="moon" initial={{ opacity: 0, rotate: 30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -30 }} transition={{ duration: 0.15 }}>
                <Moon className="w-4 h-4 text-[#5f6368]" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Google Themed Hero Section */}
      <section className="relative z-10 flex flex-col items-center w-full max-w-3xl px-4 text-center mt-6">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1 mb-5 text-xs font-semibold rounded-full bg-white dark:bg-[#303134] text-[#3c4043] dark:text-[#bdc1c6] border border-[#dadce0] dark:border-[#5f6368] shadow-sm"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-[#34A853] animate-pulse" />
          Google Maps Review & Sentiment Analytics
        </motion.div>
        
        {/* Authentic Google Multi-Color Headline */}
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-4xl sm:text-6xl md:text-7xl font-black mb-3 tracking-tight drop-shadow-sm flex flex-wrap justify-center items-center gap-x-1 sm:gap-x-2"
        >
          <span className="whitespace-nowrap">
            <span className="text-[#4285F4]">Geo</span>
            <span className="text-[#EA4335]">Sen</span>
            <span className="text-[#FBBC05]">ti</span>
            <span className="text-[#4285F4]">ment</span>
          </span>
          <span className="text-[#34A853]">Analyzer</span>
        </motion.h1>

        <p className="text-sm sm:text-base text-[#5f6368] dark:text-[#9aa0a6] max-w-xl mb-7 leading-relaxed font-normal">
          Real-time Google Maps review extraction, IndoBERT sentiment analytics, and rating anomaly detection.
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
              className="mt-8 w-full max-w-lg bg-white dark:bg-[#303134] border border-[#dadce0] dark:border-[#5f6368] p-6 rounded-3xl shadow-lg text-left"
            >
              <div className="flex items-center justify-between text-xs sm:text-sm mb-2.5">
                <span className="text-[#202124] dark:text-[#e8eaed] font-bold tracking-tight flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#4285F4] animate-ping" />
                  {statusText || 'Scraping and analyzing reviews...'}
                </span>
                <span className="font-mono font-bold text-[#1a73e8] dark:text-[#8ab4f8]">{progress}%</span>
              </div>

              <div
                className="w-full h-2 bg-[#f1f3f4] dark:bg-[#202124] rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <motion.div 
                  className="h-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#34A853]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              </div>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[#5f6368] dark:text-[#9aa0a6]">
                {reviewProgress && reviewProgress.total > 0 && (
                  <span>Reviews extracted: {reviewProgress.current} / {reviewProgress.total}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock3 className="w-3 h-3 text-[#4285F4]" /> {elapsedSeconds}s elapsed
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
              className="mt-6 p-4 bg-[#fef7e0] dark:bg-[#3d3215] border border-[#fce8b2] dark:border-[#735817] rounded-2xl text-[#b06000] dark:text-[#fdd663] text-xs sm:text-sm font-medium shadow-sm w-full max-w-lg text-left"
            >
              {warningText}
            </motion.div>
          )}

          {/* Error Banner with Guided Resolution */}
          {errorMsg && !isLoading && (
            <motion.div 
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 p-5 bg-[#fce8e6] dark:bg-[#3c1c1b] border border-[#fad2cf] dark:border-[#5c2b29] rounded-2xl text-[#c5221f] dark:text-[#f28b82] w-full max-w-xl shadow-lg text-left" 
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-[#c5221f] dark:text-[#f28b82] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[#202124] dark:text-[#fce8e6]">
                    Backend Connection Failed
                  </p>
                  
                  {isRemoteHost ? (
                    <div className="mt-2 text-xs text-[#3c4043] dark:text-[#e8eaed] space-y-2.5 leading-relaxed">
                      <p>
                        Anda sedang membuka web di <strong>{window.location.hostname}</strong> (Vercel). Karena backend scraper Playwright & AI IndoBERT berjalan di komputer lokal Anda, browser memblokir koneksi HTTP langsung karena batasan keamanan HTTPS (Mixed Content).
                      </p>
                      
                      <div className="p-3 rounded-xl bg-white dark:bg-[#202124] border border-[#fad2cf] dark:border-[#5c2b29] space-y-1.5">
                        <p className="font-bold text-[#1a73e8] dark:text-[#8ab4f8]">👉 Solusi Paling Mudah (Jalankan Lokal):</p>
                        <p>
                          Jalankan frontend lokal dan buka di browser: <br />
                          <a href="http://localhost:5173" className="font-mono font-bold underline text-[#1a73e8] dark:text-[#8ab4f8]" target="_blank" rel="noreferrer">
                            http://localhost:5173
                          </a>
                        </p>
                        <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                          (Pastikan <code>npm run dev</code> dan <code>.\.venv\Scripts\python.exe main.py</code> sudah aktif)
                        </p>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setServerUrlInput(apiBaseUrl)
                            setServerModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1a73e8] text-white text-xs font-semibold hover:bg-[#1557b0] transition-colors"
                        >
                          <Server className="w-3.5 h-3.5" />
                          Hubungkan via URL Ngrok HTTPS
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#3c4043] dark:text-[#e8eaed] mt-1 leading-relaxed">
                      Pastikan backend Python sedang aktif di port 8001: <br />
                      <code className="px-1.5 py-0.5 rounded bg-white dark:bg-[#202124] font-mono text-[11px]">cd backend && .\.venv\Scripts\python.exe main.py</code>
                    </p>
                  )}
                </div>
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

      {/* Backend Server Settings Modal */}
      <AnimatePresence>
        {serverModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#303134] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-[#dadce0] dark:border-[#5f6368] text-left"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#f1f3f4] dark:border-[#3c4043]">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-[#4285F4]" />
                  <h3 className="text-lg font-bold text-[#202124] dark:text-[#e8eaed]">Pengaturan Server Backend</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setServerModalOpen(false)}
                  className="p-1.5 rounded-full text-[#5f6368] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="py-4 space-y-3">
                <p className="text-xs text-[#5f6368] dark:text-[#9aa0a6] leading-relaxed">
                  Jika Anda menggunakan Vercel, jalankan <code>ngrok http 8001</code> di komputer Anda lalu tempelkan URL HTTPS yang dihasilkan di bawah:
                </p>

                <div>
                  <label htmlFor="backend-url" className="block text-xs font-bold text-[#3c4043] dark:text-[#bdc1c6] mb-1">
                    URL API Backend (HTTPS)
                  </label>
                  <input
                    id="backend-url"
                    type="url"
                    placeholder="https://contoh-ngrok.ngrok-free.app"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    className="w-full bg-[#f8f9fa] dark:bg-[#202124] border border-[#dadce0] dark:border-[#5f6368] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[#202124] dark:text-[#e8eaed] outline-none focus:border-[#4285F4]"
                  />
                  <p className="text-[11px] text-[#80868b] mt-1">
                    Kosongkan jika menjalankan frontend di <code>localhost:5173</code> (proxy otomatis).
                  </p>
                </div>

                {(apiBaseUrl || serverUrlInput.trim()) && (
                  <div className="p-3 bg-[#e8f0fe] dark:bg-[#1a3860]/40 rounded-2xl border border-[#aecbfa] dark:border-[#174ea6] flex items-center justify-between gap-3 mt-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#174ea6] dark:text-[#8ab4f8]">Link Siap Pakai untuk Teman</p>
                      <p className="text-[11px] text-[#1a73e8] dark:text-[#aecbfa] truncate">
                        Teman langsung terhubung tanpa perlu setting manual
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="px-3.5 py-1.5 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold shrink-0 transition-colors shadow-sm"
                    >
                      {shareCopied ? 'Tersalin!' : 'Salin Link'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#f1f3f4] dark:border-[#3c4043]">
                <button
                  type="button"
                  onClick={handleResetServerUrl}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043] transition-colors"
                >
                  Reset Default
                </button>
                <button
                  type="button"
                  onClick={handleSaveServerUrl}
                  className="px-5 py-2 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  Simpan URL
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
