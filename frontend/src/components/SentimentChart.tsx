import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { MessageSquare, ThumbsUp, ThumbsDown, Filter } from 'lucide-react'
import { cn } from '../lib/utils'
import type { ResultData, Keyword } from '../App'

type SentimentChartProps = {
  resultData: ResultData
  selectedKeyword?: string | null
  onSelectKeyword?: (keyword: string | null) => void
}

const SENTIMENT_COLORS = {
  Positive: '#16a34a', // Emerald 600
  Neutral: '#d97706',  // Amber 600
  Negative: '#dc2626', // Rose 600
}

export function SentimentChart({ resultData, selectedKeyword, onSelectKeyword }: SentimentChartProps) {
  const { chartData, totalReviews, dominantSentiment } = useMemo(() => {
    const total = resultData.meta.analyzed_count || 1
    const data = [
      { 
        name: 'Positive', 
        value: resultData.stats.Positive, 
        color: SENTIMENT_COLORS.Positive,
        percentage: Math.round(((resultData.stats.Positive || 0) / total) * 100)
      },
      { 
        name: 'Neutral', 
        value: resultData.stats.Neutral, 
        color: SENTIMENT_COLORS.Neutral,
        percentage: Math.round(((resultData.stats.Neutral || 0) / total) * 100)
      },
      { 
        name: 'Negative', 
        value: resultData.stats.Negative, 
        color: SENTIMENT_COLORS.Negative,
        percentage: Math.round(((resultData.stats.Negative || 0) / total) * 100)
      },
    ].filter((item) => item.value > 0)

    // Find dominant
    const sorted = [...data].sort((a, b) => b.value - a.value)
    const dominant = sorted[0]?.name || 'Neutral'

    return { chartData: data, totalReviews: total, dominantSentiment: dominant }
  }, [resultData])

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 md:p-10 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-elevated dark:shadow-elevated-dark relative">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* Left column: Donut Chart & Quantitative Breakdown */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Sentiment Distribution
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {totalReviews} Total
            </span>
          </div>

          <div className="w-full h-64 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={chartData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={70} 
                  outerRadius={95} 
                  paddingAngle={4} 
                  dataKey="value" 
                  stroke="none"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {chartData.find(d => d.name === dominantSentiment)?.percentage ?? 0}%
              </span>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {dominantSentiment}
              </span>
            </div>
          </div>

          {/* Linear Progress Breakdown */}
          <div className="w-full space-y-3 mt-4">
            {chartData.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                  <span>{item.value} reviews ({item.percentage}%)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${item.percentage}%`, backgroundColor: item.color }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Keywords & Praise/Complaint Breakdown */}
        <div className="lg:col-span-7 lg:border-l border-slate-100 dark:border-slate-800/80 lg:pl-10 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                Frequently Mentioned Topics
              </h4>
              {selectedKeyword && (
                <button
                  type="button"
                  onClick={() => onSelectKeyword?.(null)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Filter className="w-3 h-3" /> Clear filter ({selectedKeyword})
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {resultData.keywords.map((keyword) => {
                const isSelected = selectedKeyword?.toLowerCase() === keyword.text.toLowerCase()
                return (
                  <button
                    key={keyword.text}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onSelectKeyword?.(null)
                      } else {
                        onSelectKeyword?.(keyword.text)
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/30"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span>{keyword.text}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                    )}>
                      {keyword.value}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Keyword Groups: Praise vs Complaints */}
          {resultData.keyword_groups && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <KeywordGroup
                title="Common Praise"
                icon={<ThumbsUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                badgeColor="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40"
                items={resultData.keyword_groups.positive}
                onSelectKeyword={onSelectKeyword}
                selectedKeyword={selectedKeyword}
              />
              <KeywordGroup
                title="Common Complaints"
                icon={<ThumbsDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
                badgeColor="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40"
                items={resultData.keyword_groups.negative}
                onSelectKeyword={onSelectKeyword}
                selectedKeyword={selectedKeyword}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0]
  return (
    <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-2xl border border-slate-700/60 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.payload.color }} />
        <span>{data.name}:</span>
        <span className="text-white font-bold">{data.value} reviews ({data.payload.percentage}%)</span>
      </div>
    </div>
  )
}

function KeywordGroup({
  title,
  icon,
  badgeColor,
  items,
  onSelectKeyword,
  selectedKeyword,
}: {
  title: string
  icon: React.ReactNode
  badgeColor: string
  items: Keyword[]
  onSelectKeyword?: (keyword: string | null) => void
  selectedKeyword?: string | null
}) {
  return (
    <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
        {icon}
        <span>{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">None detected</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const isSelected = selectedKeyword?.toLowerCase() === item.text.toLowerCase()
            return (
              <button
                key={item.text}
                type="button"
                onClick={() => onSelectKeyword?.(isSelected ? null : item.text)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors",
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600"
                    : badgeColor
                )}
              >
                {item.text}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
