export function DynamicBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {/* Subtle Google ambient color halos */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#4285F4]/10 dark:bg-[#4285F4]/5 rounded-full blur-3xl" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#EA4335]/10 dark:bg-[#EA4335]/5 rounded-full blur-3xl" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-[#FBBC05]/10 dark:bg-[#FBBC05]/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-[#34A853]/10 dark:bg-[#34A853]/5 rounded-full blur-3xl" />
    </div>
  )
}
