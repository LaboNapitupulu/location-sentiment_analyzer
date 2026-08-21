import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { MessageSquare } from 'lucide-react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { cn } from '../lib/utils'
import type { ResultData, Keyword } from '../App'

type SentimentChartProps = {
  resultData: ResultData
}

export function SentimentChart({ resultData }: SentimentChartProps) {
  const chartData = useMemo(() => {
    return [
      { name: 'Positive', value: resultData.stats.Positive, color: '#34A853' },
      { name: 'Negative', value: resultData.stats.Negative, color: '#EA4335' },
      { name: 'Neutral', value: resultData.stats.Neutral, color: '#FBBC05' },
    ].filter((item) => item.value > 0)
  }, [resultData])

  // 3D Tilt Effect
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 20 })
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 20 })
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["3deg", "-3deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-3deg", "3deg"])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    x.set(mouseX / width - 0.5)
    y.set(mouseY / height - 0.5)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, type: "spring" }}
      style={{ perspective: 1000 }}
    >
      <motion.div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY }}
        className="bg-white/80 dark:bg-black/50 backdrop-blur-2xl p-6 sm:p-8 md:p-12 rounded-3xl sm:rounded-[2.5rem] shadow-2xl border border-white/50 dark:border-white/10 flex flex-col lg:flex-row gap-10 min-h-[400px] relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent dark:from-white/5 pointer-events-none rounded-[2.5rem]" />
        
        <div className="flex-1 flex flex-col items-center relative z-10">
          <h3 className="text-2xl font-extrabold mb-2 text-gray-800 dark:text-gray-100 tracking-tight">Sentiment Distribution</h3>
          <div className="w-full h-80 relative group">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={chartData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={75} 
                  outerRadius={115} 
                  paddingAngle={6} 
                  dataKey="value" 
                  label={({ percent = 0 }) => `${(percent * 100).toFixed(0)}%`}
                  stroke="none"
                >
                  {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid rgba(255,255,255,0.2)', 
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.3)',
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(10px)',
                    color: '#333'
                  }} 
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center glow effect behind pie chart */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white/50 dark:bg-black/50 rounded-full blur-2xl -z-10 group-hover:bg-white/80 dark:group-hover:bg-white/10 transition-all duration-500" />
          </div>
        </div>

        <div className="flex-1 lg:border-l border-t lg:border-t-0 border-gray-200/50 dark:border-white/10 pt-8 lg:pt-0 lg:pl-10 flex flex-col justify-center relative z-10">
          <h4 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-5 flex items-center tracking-tight">
            <MessageSquare className="w-6 h-6 mr-3 text-google-blue" /> Most Frequent Words
          </h4>
          <div className="flex flex-wrap gap-3">
            {resultData.keywords.map((keyword, i) => (
              <motion.span 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.1, y: -2 }}
                key={keyword.text} 
                className="px-4 py-2 bg-white/60 dark:bg-gray-800/60 shadow-sm border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 rounded-full text-sm font-bold backdrop-blur-md cursor-default"
              >
                {keyword.text} <span className="text-gray-400 dark:text-gray-500 ml-1 font-medium">({keyword.value})</span>
              </motion.span>
            ))}
          </div>

          {resultData.keyword_groups && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-12">
              <KeywordGroup title="Praise" color="text-google-green" items={resultData.keyword_groups.positive} />
              <KeywordGroup title="Complaints" color="text-google-red" items={resultData.keyword_groups.negative} />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function KeywordGroup({ title, color, items }: { title: string; color: string; items: Keyword[] }) {
  return (
    <div className="bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-800/50">
      <p className={cn("text-xs font-extrabold uppercase tracking-widest mb-3", color)}>{title}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-semibold">
        {items.length > 0 ? items.map((item) => item.text).join(', ') : 'No data yet'}
      </p>
    </div>
  )
}
