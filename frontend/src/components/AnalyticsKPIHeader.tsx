import { useMemo, useState } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  Star, 
  Download, 
  Check, 
  Trash2, 
  Sparkles, 
  Layers, 
  AlertTriangle 
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import type { ResultData } from '../App'
import type { PlaceDetails } from './PlacePreview'

type AnalyticsKPIHeaderProps = {
  resultData: ResultData
  place: PlaceDetails | null
  onClear: () => void
}

export function AnalyticsKPIHeader({ resultData, place, onClear }: AnalyticsKPIHeaderProps) {
  const [copied, setCopied] = useState(false)

  // Calculate metrics
  const { netScore, positivePct, negativePct, neutralPct, avgRating, totalRated } = useMemo(() => {
    const total = resultData.meta.analyzed_count || 1
    const pos = resultData.stats.Positive || 0
    const neg = resultData.stats.Negative || 0
    const neu = resultData.stats.Neutral || 0

    const posPct = Math.round((pos / total) * 100)
    const negPct = Math.round((neg / total) * 100)
    const neuPct = Math.round((neu / total) * 100)
    const net = posPct - negPct

    const ratedReviews = resultData.reviews.filter(r => typeof r.rating === 'number' && Number.isFinite(r.rating))
    const sumRatings = ratedReviews.reduce((acc, r) => acc + (r.rating || 0), 0)
    const average = ratedReviews.length > 0 ? (sumRatings / ratedReviews.length).toFixed(1) : null

    return {
      netScore: net,
      positivePct: posPct,
      negativePct: negPct,
      neutralPct: neuPct,
      avgRating: average,
      totalRated: ratedReviews.length,
    }
  }, [resultData])

  const exportCSV = () => {
    const headers = ['Review ID', 'Author', 'Rating', 'Sentiment', 'Confidence', 'Date', 'Original Text', 'English Translation']
    const rows = resultData.reviews.map(r => [
      `"${(r.review_id || '').replace(/"/g, '""')}"`,
      `"${(r.author || 'Anonymous').replace(/"/g, '""')}"`,
      r.rating !== null ? r.rating : '',
      r.sentiment,
      (r.confidence * 100).toFixed(1) + '%',
      `"${(r.date || '').replace(/"/g, '""')}"`,
      `"${r.text.replace(/"/g, '""')}"`,
      `"${(r.translation_en || r.text).replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const filename = place?.display_name 
      ? `sentiment_${place.display_name.replace(/[^a-zA-Z0-9]/g, '_')}.csv` 
      : 'sentiment_analysis.csv'
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const copySummary = async () => {
    const venue = place?.display_name || 'Location'
    const summary = [
      `📊 Sentiment Summary: ${venue}`,
      `Total Reviews: ${resultData.meta.analyzed_count}`,
      `Net Sentiment Score: ${netScore > 0 ? '+' : ''}${netScore}%`,
      `Positive: ${positivePct}% | Neutral: ${neutralPct}% | Negative: ${negativePct}%`,
      avgRating ? `Average Star Rating: ${avgRating} / 5.0 (${totalRated} rated)` : '',
      `Anomalies Detected: ${resultData.anomalies.length}`,
      `Analyzed via GeoSentiment (${resultData.meta.model_id})`
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="mb-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-elevated dark:shadow-elevated-dark">
      {/* Top row: Title and Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {place?.display_name || 'Analysis Overview'}
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {resultData.meta.analyzed_count} Reviews
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Processed via <span className="font-medium text-slate-700 dark:text-slate-300">{resultData.meta.model_id}</span>
            {resultData.meta.translated_review_count ? ` · ${resultData.meta.translated_review_count} translated` : ''}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={copySummary}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Sparkles className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Summary'}
          </button>

          <button
            type="button"
            onClick={exportCSV}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={onClear}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-950/50 dark:hover:text-red-400 text-slate-600 dark:text-slate-300 transition-colors"
            title="Clear current results"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
        {/* Net Sentiment Score */}
        <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Net Sentiment</span>
            {netScore >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn(
              "text-3xl font-extrabold tracking-tight",
              netScore > 20 ? "text-emerald-600 dark:text-emerald-400" :
              netScore < -20 ? "text-rose-600 dark:text-rose-400" :
              "text-amber-600 dark:text-amber-400"
            )}>
              {netScore > 0 ? `+${netScore}` : netScore}%
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">
            {netScore > 40 ? 'Highly Positive Rep' : netScore > 0 ? 'Favorable Feedback' : 'Needs Attention'}
          </span>
        </div>

        {/* Average Rating */}
        <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Avg Star Rating</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
              {avgRating ?? '—'}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ 5.0</span>
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">
            From {totalRated} customer ratings
          </span>
        </div>

        {/* Sentiment Ratios */}
        <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Sentiment Split</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
            <span className="text-emerald-600 dark:text-emerald-400">{positivePct}% Pos</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-amber-600 dark:text-amber-400">{neutralPct}% Neu</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-rose-600 dark:text-rose-400">{negativePct}% Neg</span>
          </div>
          {/* Mini stacked bar */}
          <div className="w-full h-2 rounded-full overflow-hidden flex mt-2 bg-slate-200 dark:bg-slate-700">
            <div style={{ width: `${positivePct}%` }} className="bg-emerald-500" />
            <div style={{ width: `${neutralPct}%` }} className="bg-amber-400" />
            <div style={{ width: `${negativePct}%` }} className="bg-rose-500" />
          </div>
        </div>

        {/* Rating Anomalies */}
        <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Rating Conflicts</span>
            <AlertTriangle className={cn(
              "w-4 h-4",
              resultData.anomalies.length > 0 ? "text-amber-500" : "text-slate-400"
            )} />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={cn(
              "text-3xl font-extrabold tracking-tight",
              resultData.anomalies.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"
            )}>
              {resultData.anomalies.length}
            </span>
            <span className="text-xs font-medium text-slate-400">flagged</span>
          </div>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">
            Star & text sentiment divergence
          </span>
        </div>
      </div>
    </div>
  )
}
