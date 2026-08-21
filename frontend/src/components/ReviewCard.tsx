import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { cn } from '../lib/utils'

export type Sentiment = 'Positive' | 'Negative' | 'Neutral'

export type Review = {
  review_id?: string
  text: string
  rating: number | null
  sentiment: Sentiment
  confidence: number
  author?: string
  date?: string
  translation_en?: string
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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
}

export function ReviewCard({ title, color, icon, reviews }: { title: string; color: string; icon: ReactNode; reviews: Review[] }) {
  return (
    <motion.article 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
      className="bg-white/70 dark:bg-black/40 backdrop-blur-2xl p-8 sm:p-10 rounded-[2.5rem] shadow-xl shadow-gray-200/50 dark:shadow-black/40 border border-white/50 dark:border-white/10 h-full hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 relative overflow-hidden group"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent dark:from-white/5 pointer-events-none" />
      
      <h3 className={cn("text-2xl font-extrabold mb-8 flex items-center tracking-tight relative z-10", color)}>
        {icon}
        {title}
      </h3>
      
      {reviews.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 font-medium relative z-10">No reviews in this category.</p>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-8 relative z-10"
        >
          {reviews.map((review, i) => (
            <motion.div 
              variants={itemVariants}
              key={review.review_id ?? `${review.text}-${review.date}`} 
              className={cn("pb-8", i !== reviews.length - 1 && "border-b border-gray-200 dark:border-gray-800")}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-yellow-500 text-lg tracking-widest drop-shadow-sm">{renderStars(review.rating)}</span>
                  <span className={cn(
                    "text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm",
                    review.sentiment === 'Positive' 
                      ? 'text-google-green bg-green-50 dark:bg-green-900/30' 
                      : 'text-google-red bg-red-50 dark:bg-red-900/30'
                  )}>
                    {(review.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {review.author && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-semibold bg-gray-50 dark:bg-gray-800/50 px-3 py-1 rounded-full">
                    <span className="text-gray-700 dark:text-gray-300">{review.author}</span>
                    {review.date && <span className="opacity-70"> · {formatReviewDate(review.date)}</span>}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  {review.translation_en && review.translation_en !== review.text && (
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">
                      Original review
                    </p>
                  )}
                  <p className="text-gray-800 dark:text-gray-200 text-base leading-relaxed break-words font-medium">
                    “{review.text}”
                  </p>
                </div>
                {review.translation_en && review.translation_en !== review.text && (
                  <motion.div 
                    whileHover={{ scale: 1.02 }}
                    className="rounded-2xl border border-gray-200/60 dark:border-gray-700/50 bg-blue-50/50 dark:bg-blue-900/10 p-5 mt-4 shadow-inner"
                  >
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-google-blue mb-2">
                      English translation
                    </p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed break-words font-medium">
                      {review.translation_en}
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.article>
  )
}
