import { motion } from 'framer-motion'

export function DynamicBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <motion.div
        className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-google-blue/20 dark:bg-google-blue/10 rounded-full blur-[120px]"
        animate={{
          scale: [1, 1.2, 1],
          x: [0, -50, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute top-[20%] -left-[10%] w-[40%] h-[40%] bg-google-red/20 dark:bg-google-red/10 rounded-full blur-[100px]"
        animate={{
          scale: [1, 1.3, 1],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute -bottom-[10%] left-[20%] w-[60%] h-[60%] bg-google-yellow/15 dark:bg-google-yellow/10 rounded-full blur-[120px]"
        animate={{
          scale: [1, 1.1, 1],
          x: [0, 30, 0],
          y: [0, -40, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* Additional subtle orbs for more dynamic feel */}
      <motion.div
        className="absolute top-[50%] right-[20%] w-[30%] h-[30%] bg-google-green/10 dark:bg-google-green/5 rounded-full blur-[90px]"
        animate={{
          scale: [1, 1.4, 1],
          x: [0, -40, 0],
          y: [0, 60, 0],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  )
}
