import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  MapPin,
  MessageSquare,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'

type Sentiment = 'Positive' | 'Negative' | 'Neutral'

type Review = {
  review_id?: string
  text: string
  rating: number | null
  sentiment: Sentiment
  confidence: number
  author?: string
  date?: string
  translation_en?: string
}

type Stats = Record<Sentiment, number>
type Keyword = { text: string; value: number }

type PlaceDetails = {
  place_id: string
  display_name: string
  formatted_address: string
  primary_type: string
  google_maps_uri?: string
  map_uri: string
  map_provider: string
  analysis_value: string
  photo_url: string | null
  provider: 'google' | 'openstreetmap'
  data_attribution: string
  latitude?: number | null
  longitude?: number | null
  photo_attributions: Array<{
    display_name: string
    uri: string
    license?: string
    license_uri?: string
  }>
}

type ResultData = {
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

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const API_BASE_URL = configuredApiBase?.replace(/\/+$/, '') ?? ''

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

function buildAnalyzeUrl(input: string): string {
  const endpoint = API_BASE_URL
    ? new URL(`${API_BASE_URL}/api/analyze`)
    : new URL('/api/analyze', window.location.origin)
  endpoint.searchParams.set('url', input)
  return endpoint.toString()
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
      'google.com',
      'www.google.com',
      'maps.google.com',
      'google.co.id',
      'www.google.co.id',
      'maps.google.co.id',
      'google.co.uk',
      'www.google.co.uk',
      'maps.google.co.uk',
      'google.com.au',
      'www.google.com.au',
      'maps.google.com.au',
      'google.ca',
      'www.google.ca',
      'maps.google.ca',
      'google.de',
      'www.google.de',
      'maps.google.de',
      'google.fr',
      'www.google.fr',
      'maps.google.fr',
      'google.co.jp',
      'www.google.co.jp',
      'maps.google.co.jp',
      'google.co.kr',
      'www.google.co.kr',
      'maps.google.co.kr',
      'google.com.sg',
      'www.google.com.sg',
      'maps.google.com.sg',
      'google.com.my',
      'www.google.com.my',
      'maps.google.com.my',
    ])
    return googleHosts.has(hostname) && parsed.pathname.includes('/maps')
  } catch {
    return false
  }
}

function renderStars(rating: number | null): string {
  if (rating === null || !Number.isFinite(rating)) return 'Rating unavailable'
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)))
  return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}`
}

function formatReviewDate(value: string): string {
  let date = value.trim()
  const wasEdited = /^diedit\s+/i.test(date)
  date = date.replace(/^diedit\s+/i, '')
  const exactDates: Record<string, string> = {
    'baru saja': 'just now',
    'kemarin': 'yesterday',
    'sehari lalu': 'a day ago',
    'seminggu lalu': 'a week ago',
    'sebulan lalu': 'a month ago',
    'setahun lalu': 'a year ago',
  }
  let translated = exactDates[date.toLowerCase()] ?? date
  translated = translated
    .replace(/^(\d+)\s+hari lalu$/i, '$1 days ago')
    .replace(/^(\d+)\s+minggu lalu$/i, '$1 weeks ago')
    .replace(/^(\d+)\s+bulan lalu$/i, '$1 months ago')
    .replace(/^(\d+)\s+tahun lalu$/i, '$1 years ago')
  return wasEdited ? `Edited ${translated}` : translated
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
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(
    null,
  )
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
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
    return () => abortControllerRef.current?.abort()
  }, [])

  const estimatedRemaining = useMemo(() => {
    if (!isLoading || progress < 5 || progress >= 100 || elapsedSeconds < 2) return null
    return Math.max(0, Math.round((elapsedSeconds * (100 - progress)) / progress))
  }, [elapsedSeconds, isLoading, progress])

  const chartData = useMemo(() => {
    if (!resultData) return []
    return [
      { name: 'Positive', value: resultData.stats.Positive, color: '#34A853' },
      { name: 'Negative', value: resultData.stats.Negative, color: '#EA4335' },
      { name: 'Neutral', value: resultData.stats.Neutral, color: '#FBBC05' },
    ].filter((item) => item.value > 0)
  }, [resultData])

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
      setErrorMsg(
        'Paste an official Google Maps place link, such as https://maps.app.goo.gl/...',
      )
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
      headers: {
        'ngrok-skip-browser-warning': 'true'
      },
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

  return (
    <main className="min-h-screen bg-google-light dark:bg-google-darkBg text-gray-900 dark:text-google-darkText flex flex-col items-center pt-20 pb-20 font-sans transition-colors duration-200">
      <button
        type="button"
        onClick={() => setIsDark((value) => !value)}
        className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {isDark ? (
          <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <section className="flex flex-col items-center w-full max-w-2xl px-4">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3 text-center">
          <span className="text-google-blue">Geo</span>
          <span className="text-google-red">Sen</span>
          <span className="text-google-yellow">ti</span>
          <span className="text-google-blue">ment</span>
          <span className="text-google-green ml-2">Analyzer</span>
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 text-center">
          Paste a Google Maps place link to collect and analyze its reviews.
        </p>

        <form className="w-full" onSubmit={startAnalysis}>
          <label htmlFor="location-input" className="sr-only">
            Google Maps place link
          </label>
          <div className="relative">
            <div className={`w-full flex items-center bg-white dark:bg-google-darkSurface rounded-full border ${isLoading ? 'border-google-blue ring-2 ring-blue-100 dark:ring-blue-900' : 'border-gray-200 dark:border-google-darkBorder'} hover:shadow-md focus-within:shadow-md transition-all px-5 py-3`}>
              <MapPin className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
              <input
                id="location-input"
                type="text"
                inputMode="url"
                placeholder="https://maps.app.goo.gl/..."
                className="flex-1 min-w-0 outline-none text-gray-700 dark:text-google-darkText bg-transparent disabled:opacity-50"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value)
                  setSelectedPlace(null)
                  setErrorMsg('')
                }}
                disabled={isLoading}
                maxLength={2048}
                autoComplete="off"
              />
              {isLoading && (
                <LoaderCircle
                  className="w-5 h-5 ml-3 text-google-blue animate-spin shrink-0"
                  aria-label="Processing place"
                />
              )}
            </div>

          </div>

          <p className="mt-2 px-4 text-xs text-gray-500 dark:text-gray-400">
            In Google Maps, select a place → Share → Copy link, then paste it here.
          </p>

          {selectedPlace && (
            <PlacePreview place={selectedPlace} />
          )}

          <div className="mt-6 flex justify-center">
            {isLoading ? (
              <button type="button" onClick={cancelAnalysis} className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 hover:bg-red-100 text-google-red font-medium py-2 px-4 rounded transition-colors">
                ✕ Cancel
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="bg-white dark:bg-google-darkSurface border border-gray-200 dark:border-google-darkBorder hover:shadow-sm disabled:opacity-50 text-gray-700 dark:text-google-darkText font-medium py-2 px-5 rounded transition-all">
                Analyze Sentiment
              </button>
            )}
          </div>
        </form>

        {isLoading && (
          <div className="mt-8 w-full max-w-lg" aria-live="polite">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-google-blue font-medium">{statusText}</span>
              <span className="text-gray-500">{progress}%</span>
            </div>
            <div
              className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full bg-google-blue transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {reviewProgress && reviewProgress.total > 0 && (
                <span>Reviews: {reviewProgress.current}/{reviewProgress.total}</span>
              )}
              <span className="flex items-center"><Clock3 className="w-3.5 h-3.5 mr-1" /> Running for {elapsedSeconds} seconds</span>
              {estimatedRemaining !== null && <span>Estimated time left: ±{estimatedRemaining} seconds</span>}
            </div>
          </div>
        )}

        {warningText && !isLoading && !errorMsg && (
          <div className="mt-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm w-full">
            {warningText}
          </div>
        )}

        {errorMsg && !isLoading && (
          <div className="mt-8 flex flex-col items-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-google-red w-full max-w-lg" role="alert">
            <AlertCircle className="w-6 h-6 mb-2" />
            <p className="font-medium text-center">{errorMsg}</p>
          </div>
        )}
      </section>

      {resultData && !isLoading && (
        <section className="w-full max-w-6xl mt-16 px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Sentiment Analysis Results</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              {resultData.meta.analyzed_count} reviews analyzed using {resultData.meta.model_id}
            </p>
            <p className="text-xs text-gray-400 mt-1">Review source: Google Maps · Data is not retained after the session ends</p>
          </div>

          {resultData.anomalies.length > 0 && (
            <div className="mb-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-5 flex items-start">
              <ShieldAlert className="w-6 h-6 text-yellow-600 dark:text-yellow-500 mr-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-400">Potential rating and sentiment anomalies ({resultData.anomalies.length})</h3>
                <p className="text-yellow-700 dark:text-yellow-500 text-sm mt-1">The star rating conflicts with the text sentiment. This is an indicator, not proof of sarcasm or spam.</p>
                <div className="mt-3 space-y-2">
                  {resultData.anomalies.slice(0, 3).map((review) => (
                    <div key={review.review_id ?? `${review.text}-${review.date}`} className="text-sm bg-white dark:bg-black/20 p-3 rounded border border-yellow-100 dark:border-yellow-800/50 break-words">
                      <span className="font-medium mr-2">★ {review.rating ?? '—'}</span>
                      <span className="italic">“{review.text}”</span>
                      <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 uppercase">AI: {review.sentiment}</span>
                      {review.translation_en && review.translation_en !== review.text && (
                        <p className="mt-2 text-xs text-yellow-900 dark:text-yellow-200">
                          <span className="font-semibold">English:</span>{' '}
                          {review.translation_en}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1 bg-white dark:bg-google-darkSurface p-6 rounded-xl shadow-sm border border-gray-100 dark:border-google-darkBorder flex flex-col items-center">
              <h3 className="text-lg font-semibold mb-4 self-start">Sentiment Summary</h3>
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="45%" innerRadius={55} outerRadius={82} paddingAngle={4} dataKey="value" label={({ percent = 0 }) => `${(percent * 100).toFixed(0)}%`}>
                      {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2" /> Most frequent words
                </h4>
                <div className="flex flex-wrap gap-2">
                  {resultData.keywords.map((keyword) => (
                    <span key={keyword.text} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">
                      {keyword.text} ({keyword.value})
                    </span>
                  ))}
                </div>

                {resultData.keyword_groups && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                    <KeywordGroup title="Praise" color="text-google-green" items={resultData.keyword_groups.positive} />
                    <KeywordGroup title="Complaints" color="text-google-red" items={resultData.keyword_groups.negative} />
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 lg:col-span-2 space-y-6">
              <ReviewCard title="Top Positive Reviews" color="text-google-green" icon={<ThumbsUp className="w-5 h-5 mr-2" />} reviews={topBottomReviews.top} />
              <ReviewCard title="Top Complaints (Negative)" color="text-google-red" icon={<ThumbsDown className="w-5 h-5 mr-2" />} reviews={topBottomReviews.bottom} />
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

function PlacePreview({ place }: { place: PlaceDetails }) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [place.photo_url])
  const showPhoto = Boolean(place.photo_url) && !imageFailed
  const hasCoordinates =
    typeof place.latitude === 'number' &&
    Number.isFinite(place.latitude) &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.longitude)
  const mapPreviewUrl = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({
        bbox: [
          (place.longitude as number) - 0.004,
          (place.latitude as number) - 0.003,
          (place.longitude as number) + 0.004,
          (place.latitude as number) + 0.003,
        ].join(','),
        layer: 'mapnik',
        marker: `${place.latitude},${place.longitude}`,
      }).toString()}`
    : ''

  return (
    <article className="mt-4 overflow-hidden bg-white dark:bg-google-darkSurface border border-gray-200 dark:border-google-darkBorder rounded-2xl shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
        <div className="h-40 sm:h-full min-h-36 bg-gray-100 dark:bg-gray-800">
          {showPhoto ? (
            <img
              src={place.photo_url ?? ''}
              alt={`Photo of ${place.display_name}`}
              className="w-full h-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : hasCoordinates ? (
            <iframe
              src={mapPreviewUrl}
              title={`Map of ${place.display_name}`}
              className="w-full h-full min-h-40 border-0"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full min-h-36 flex flex-col items-center justify-center text-gray-400">
              <ImageOff className="w-7 h-7 mb-2" />
              <span className="text-xs">Photo unavailable</span>
            </div>
          )}
        </div>
        <div className="p-4 min-w-0 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {place.display_name}
              </p>
              {place.primary_type && (
                <p className="text-xs text-google-blue mt-0.5">{place.primary_type}</p>
              )}
            </div>
            {(place.map_uri || place.google_maps_uri) && (
              <a
                href={place.map_uri || place.google_maps_uri}
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 hover:text-google-blue shrink-0"
                aria-label={`Open place in ${place.map_provider}`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            {place.formatted_address}
          </p>
          {showPhoto && place.photo_attributions.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-3">
              Photo by{' '}
              {place.photo_attributions.map((attribution, index) => (
                <span key={`${attribution.display_name}-${index}`}>
                  {index > 0 && ', '}
                  {attribution.uri ? (
                    <a
                      href={attribution.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-google-blue"
                    >
                      {attribution.display_name}
                    </a>
                  ) : (
                    attribution.display_name
                  )}
                  {attribution.license && (
                    <>
                      {' · '}
                      {attribution.license_uri ? (
                        <a
                          href={attribution.license_uri}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-google-blue"
                        >
                          {attribution.license}
                        </a>
                      ) : (
                        attribution.license
                      )}
                    </>
                  )}
                </span>
              ))}
            </p>
          )}
          {place.data_attribution && (
            <p className="text-[10px] text-gray-400 mt-2">{place.data_attribution}</p>
          )}
        </div>
      </div>
    </article>
  )
}

function KeywordGroup({ title, color, items }: { title: string; color: string; items: Keyword[] }) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-2 ${color}`}>{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {items.length > 0 ? items.map((item) => item.text).join(', ') : 'No data yet'}
      </p>
    </div>
  )
}

function ReviewCard({ title, color, icon, reviews }: { title: string; color: string; icon: ReactNode; reviews: Review[] }) {
  return (
    <article className="bg-white dark:bg-google-darkSurface p-6 rounded-xl shadow-sm border border-gray-100 dark:border-google-darkBorder">
      <h3 className={`text-lg font-semibold mb-4 flex items-center ${color}`}>{icon}{title}</h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No reviews in this category.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.review_id ?? `${review.text}-${review.date}`} className="pb-4 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-yellow-500 text-sm tracking-wider">{renderStars(review.rating)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${review.sentiment === 'Positive' ? 'text-google-green bg-green-50 dark:bg-green-900/20' : 'text-google-red bg-red-50 dark:bg-red-900/20'}`}>
                    {(review.confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>
                {review.author && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">{review.author}</span>
                    {review.date && <span> · {formatReviewDate(review.date)}</span>}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Original review
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed break-words">
                    “{review.text}”
                  </p>
                </div>
                {review.translation_en && (
                  <div className="rounded-lg border border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/25 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-google-blue mb-1">
                      English translation
                    </p>
                    <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed break-words">
                      {review.translation_en}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default App
