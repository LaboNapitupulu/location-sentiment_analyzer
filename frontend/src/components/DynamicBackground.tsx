export function DynamicBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {/* Subtle geospatial dot grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.45] dark:opacity-[0.25]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          color: '#94a3b8'
        }}
      />

      {/* Soft directional ambiance tailored for light and dark modes */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-blue-500/10 via-emerald-500/5 to-transparent dark:from-blue-600/15 dark:via-emerald-500/5 rounded-full blur-3xl" />
      <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-gradient-to-bl from-indigo-500/5 to-transparent dark:from-indigo-600/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/5 to-transparent dark:from-emerald-600/10 rounded-full blur-3xl" />
    </div>
  )
}
