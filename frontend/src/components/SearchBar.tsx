import type { FormEvent } from 'react'
import { MapPin, LoaderCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'

type SearchBarProps = {
  input: string
  setInput: (value: string) => void
  isLoading: boolean
  startAnalysis: (e: FormEvent) => void
  cancelAnalysis: () => void
}

export function SearchBar({ input, setInput, isLoading, startAnalysis, cancelAnalysis }: SearchBarProps) {
  return (
    <form className="w-full relative z-10" onSubmit={startAnalysis}>
      <label htmlFor="location-input" className="sr-only">
        Google Maps place link
      </label>
      <motion.div 
        className="relative group"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className={cn(
          "w-full flex items-center bg-white/60 dark:bg-black/40 backdrop-blur-2xl rounded-2xl border transition-all duration-500 px-6 py-4 shadow-2xl",
          isLoading 
            ? "border-google-blue ring-4 ring-google-blue/30 shadow-google-blue/20" 
            : "border-white/40 dark:border-white/10 hover:border-google-blue/50 focus-within:border-google-blue focus-within:ring-4 focus-within:ring-google-blue/20"
        )}>
          <motion.div
            initial={false}
            animate={{ 
              rotate: isLoading ? 360 : 0,
              scale: isLoading ? 1.2 : 1
            }}
            transition={{ duration: 2, repeat: isLoading ? Infinity : 0, ease: "linear" }}
          >
            <MapPin className="w-6 h-6 text-google-blue mr-3 shrink-0" />
          </motion.div>
          <input
            id="location-input"
            type="text"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/..."
            className="flex-1 min-w-0 outline-none text-gray-800 dark:text-gray-100 bg-transparent disabled:opacity-50 font-medium placeholder:text-gray-400 dark:placeholder:text-gray-500"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
        
        {/* 3D Under-glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-google-blue via-google-red to-google-yellow rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 -z-10" />
      </motion.div>

      <p className="mt-4 px-4 text-sm text-gray-600 dark:text-gray-400 text-center font-medium">
        In Google Maps, select a place → Share → Copy link, then paste it here.
      </p>

      <motion.div 
        className="mt-8 flex justify-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {isLoading ? (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button" 
            onClick={cancelAnalysis} 
            className="relative overflow-hidden bg-white/80 dark:bg-black/50 backdrop-blur-md border border-red-200/50 dark:border-red-500/30 text-google-red font-semibold py-3 px-8 rounded-full shadow-lg transition-colors group"
          >
            <span className="relative z-10">✕ Cancel Analysis</span>
            <div className="absolute inset-0 bg-red-100 dark:bg-red-900/40 translate-y-[100%] group-hover:translate-y-[0%] transition-transform duration-300" />
          </motion.button>
        ) : (
          <motion.button 
            whileHover={{ scale: 1.05, boxShadow: "0 10px 30px -10px rgba(66, 133, 244, 0.5)" }}
            whileTap={{ scale: 0.95 }}
            type="submit" 
            disabled={!input.trim()} 
            className="relative overflow-hidden bg-gradient-to-r from-google-blue to-blue-600 text-white font-semibold py-3 px-8 rounded-full shadow-lg disabled:opacity-50 disabled:grayscale transition-all group"
          >
            <span className="relative z-10 flex items-center">
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Sentiment
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-[0%] transition-transform duration-300" />
          </motion.button>
        )}
      </motion.div>
    </form>
  )
}

function Sparkles(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}
