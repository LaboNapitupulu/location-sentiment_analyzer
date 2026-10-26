import { useState, useMemo } from 'react'
import { 
  Search, 
  Filter, 
  ThumbsUp, 
  ThumbsDown, 
  Minus, 
  AlertTriangle, 
  Copy, 
  Check, 
  Languages, 
  ChevronDown, 
  Sparkles,
  ArrowUpDown
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import type { Review, Sentiment } from './ReviewCard'

type ReviewExplorerProps = {
  reviews: Review[]
  anomalies: Review[]
  selectedKeyword?: string | null
  onClearKeyword?: () => void
}

type TabType = 'All' | Sentiment | 'Anomalies'

function renderStars(rating: number | null): string {
  if (rating === null || !Number.isFinite(rating)) return '—'
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)))
  return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}`
}

function formatReviewDate(value?: string): string {
  if (!value) return ''
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
    .replace(/^(\d+)\s+hari lalu$/i, '$1d ago')
    .replace(/^(\d+)\s+minggu lalu$/i, '$1w ago')
    .replace(/^(\d+)\s+bulan lalu$/i, '$1mo ago')
    .replace(/^(\d+)\s+tahun lalu$/i, '$1y ago')
  return wasEdited ? `Edited ${translated}` : translated
}

export function ReviewExplorer({
  reviews,
  anomalies,
  selectedKeyword,
  onClearKeyword,
}: ReviewExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'conf_desc' | 'conf_asc' | 'rating_desc' | 'rating_asc'>('conf_desc')
  const [visibleCount, setVisibleCount] = useState(10)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({})

  // Set of anomaly IDs or signature texts
  const anomalyKeySet = useMemo(() => {
    const set = new Set<string>()
    anomalies.forEach((a) => {
      set.add(a.review_id ?? `${a.text}-${a.date}`)
    })
    return set
  }, [anomalies])

  // Counts for tabs
  const tabCounts = useMemo(() => {
    return {
      All: reviews.length,
      Positive: reviews.filter((r) => r.sentiment === 'Positive').length,
      Neutral: reviews.filter((r) => r.sentiment === 'Neutral').length,
      Negative: reviews.filter((r) => r.sentiment === 'Negative').length,
      Anomalies: anomalies.length,
    }
  }, [reviews, anomalies])

  // Filtered & Sorted reviews
  const filteredReviews = useMemo(() => {
    return reviews
      .filter((review) => {
        // Tab filter
        if (activeTab === 'Anomalies') {
          const key = review.review_id ?? `${review.text}-${review.date}`
          if (!anomalyKeySet.has(key)) return false
        } else if (activeTab !== 'All' && review.sentiment !== activeTab) {
          return false
        }

        // Rating filter
        if (ratingFilter !== 'all' && review.rating !== ratingFilter) {
          return false
        }

        // Keyword filter from SentimentChart
        if (selectedKeyword) {
          const kw = selectedKeyword.toLowerCase()
          const inOriginal = review.text.toLowerCase().includes(kw)
          const inTrans = review.translation_en?.toLowerCase().includes(kw) ?? false
          if (!inOriginal && !inTrans) return false
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const inOriginal = review.text.toLowerCase().includes(q)
          const inAuthor = review.author?.toLowerCase().includes(q) ?? false
          const inTrans = review.translation_en?.toLowerCase().includes(q) ?? false
          if (!inOriginal && !inAuthor && !inTrans) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'conf_desc') return b.confidence - a.confidence
        if (sortBy === 'conf_asc') return a.confidence - b.confidence
        if (sortBy === 'rating_desc') return (b.rating ?? 0) - (a.rating ?? 0)
        if (sortBy === 'rating_asc') return (a.rating ?? 0) - (b.rating ?? 0)
        return 0
      })
  }, [reviews, activeTab, ratingFilter, selectedKeyword, searchQuery, sortBy, anomalyKeySet])

  const displayedReviews = useMemo(() => {
    return filteredReviews.slice(0, visibleCount)
  }, [filteredReviews, visibleCount])

  const copyReviewText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback
    }
  }

  const toggleTranslation = (id: string) => {
    setExpandedTranslations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-elevated dark:shadow-elevated-dark">
      {/* Header and Sentiment Tabs */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Review Explorer
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Filter, search, and inspect all {reviews.length} analyzed customer reviews
          </p>
        </div>

        {/* Sentiment Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-2xl w-full md:w-auto">
          {(['All', 'Positive', 'Neutral', 'Negative', 'Anomalies'] as const).map((tab) => {
            const isActive = activeTab === tab
            const count = tabCounts[tab]
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab)
                  setVisibleCount(10)
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex-1 md:flex-none justify-center",
                  isActive
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                {tab === 'Positive' && <ThumbsUp className="w-3 h-3 text-emerald-500" />}
                {tab === 'Neutral' && <Minus className="w-3 h-3 text-amber-500" />}
                {tab === 'Negative' && <ThumbsDown className="w-3 h-3 text-rose-500" />}
                {tab === 'Anomalies' && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                <span>{tab}</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full",
                  isActive
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                    : "bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400"
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 pb-4">
        {/* Search within reviews */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search keywords or author in reviews..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setVisibleCount(10)
            }}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500"
          />
        </div>

        {/* Rating filter & Sorting */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Star Filter */}
          <select
            value={ratingFilter}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : Number(e.target.value)
              setRatingFilter(val)
              setVisibleCount(10)
            }}
            className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            aria-label="Filter by star rating"
          >
            <option value="all">All Stars</option>
            <option value="5">★ 5 Stars</option>
            <option value="4">★ 4 Stars</option>
            <option value="3">★ 3 Stars</option>
            <option value="2">★ 2 Stars</option>
            <option value="1">★ 1 Star</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            aria-label="Sort reviews"
          >
            <option value="conf_desc">Highest AI Confidence</option>
            <option value="conf_asc">Lowest AI Confidence</option>
            <option value="rating_desc">Highest Star Rating</option>
            <option value="rating_asc">Lowest Star Rating</option>
          </select>
        </div>
      </div>

      {/* Active Keyword Badge */}
      {selectedKeyword && (
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200/60 dark:border-blue-800/50">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtered by keyword: <strong>"{selectedKeyword}"</strong></span>
          <button
            type="button"
            onClick={onClearKeyword}
            className="ml-1 text-xs hover:text-blue-900 dark:hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Results Count Summary */}
      <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 font-medium">
        Showing {displayedReviews.length} of {filteredReviews.length} matching reviews
      </div>

      {/* Reviews List */}
      {displayedReviews.length === 0 ? (
        <div className="py-12 text-center text-slate-400 dark:text-slate-500">
          <p className="text-sm font-semibold">No reviews match the selected filters.</p>
          <button
            type="button"
            onClick={() => {
              setActiveTab('All')
              setSearchQuery('')
              setRatingFilter('all')
              onClearKeyword?.()
            }}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayedReviews.map((review) => {
            const reviewId = review.review_id ?? `${review.text}-${review.date}`
            const isAnomaly = anomalyKeySet.has(reviewId)
            const isExpanded = expandedTranslations[reviewId] ?? false
            const hasTranslation = Boolean(review.translation_en && review.translation_en !== review.text)

            return (
              <motion.article
                key={reviewId}
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 sm:p-5 rounded-2xl border transition-all duration-200",
                  isAnomaly 
                    ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-800/40"
                    : "bg-slate-50/60 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700/60"
                )}
              >
                {/* Review Header: Stars, Author, Date, Sentiment & Anomaly Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-amber-500 font-extrabold text-sm sm:text-base tracking-widest">
                      {renderStars(review.rating)}
                    </span>
                    {review.rating !== null && (
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {review.rating}.0
                      </span>
                    )}
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {review.author || 'Google User'}
                    </span>
                    {review.date && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        ({formatReviewDate(review.date)})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Anomaly Badge */}
                    {isAnomaly && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3 h-3" />
                        Rating Divergence
                      </span>
                    )}

                    {/* Sentiment Badge */}
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1",
                      review.sentiment === 'Positive' 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' 
                        : review.sentiment === 'Negative'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                    )}>
                      {review.sentiment === 'Positive' && <ThumbsUp className="w-3 h-3" />}
                      {review.sentiment === 'Negative' && <ThumbsDown className="w-3 h-3" />}
                      {review.sentiment === 'Neutral' && <Minus className="w-3 h-3" />}
                      <span>{review.sentiment}</span>
                      <span className="opacity-70 text-[10px]">({Math.round(review.confidence * 100)}%)</span>
                    </span>

                    {/* Copy Button */}
                    <button
                      type="button"
                      onClick={() => copyReviewText(reviewId, review.text)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                      title="Copy review text"
                      aria-label="Copy review text"
                    >
                      {copiedId === reviewId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Review Text */}
                <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-normal">
                  “{review.text}”
                </p>

                {/* Translation Accordion Toggle */}
                {hasTranslation && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => toggleTranslation(reviewId)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{isExpanded ? 'Hide English Translation' : 'View English Translation'}</span>
                      <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-2 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic"
                        >
                          “{review.translation_en}”
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.article>
            )
          })}
        </div>
      )}

      {/* Load More Button */}
      {visibleCount < filteredReviews.length && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            Load 10 more reviews ({filteredReviews.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
