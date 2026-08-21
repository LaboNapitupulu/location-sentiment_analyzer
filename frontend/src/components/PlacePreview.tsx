import { useState, useEffect } from 'react'
import { ExternalLink, ImageOff } from 'lucide-react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

export type PlaceDetails = {
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

export function PlacePreview({ place }: { place: PlaceDetails }) {
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

  // 3D Tilt Effect
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 20 })
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 20 })

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
      style={{ perspective: 1200 }}
      className="mt-8 w-full max-w-2xl mx-auto"
    >
      <motion.article 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY }}
        className="bg-white/80 dark:bg-black/50 backdrop-blur-2xl rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 lg:p-10 shadow-2xl border border-white/50 dark:border-white/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 pointer-events-none rounded-[2rem]" />
        
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] h-full relative z-10">
          <div className="h-48 sm:h-full min-h-[12rem] bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
            {showPhoto ? (
              <motion.img
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                src={place.photo_url ?? ''}
                alt={`Photo of ${place.display_name}`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : hasCoordinates ? (
              <div className="absolute inset-0 w-full h-full bg-blue-50/50 dark:bg-blue-900/10">
                <iframe
                  src={mapPreviewUrl}
                  title={`Map of ${place.display_name}`}
                  className="absolute inset-0 w-full h-full border-0 mix-blend-multiply dark:mix-blend-screen opacity-80"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-gray-400">
                <ImageOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm font-medium">Photo unavailable</span>
              </div>
            )}
          </div>
          
          <div className="p-6 min-w-0 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-gray-900 dark:text-gray-100 truncate tracking-tight">
                  {place.display_name}
                </p>
                {place.primary_type && (
                  <p className="text-xs font-bold text-google-blue mt-1.5 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 inline-block px-2 py-0.5 rounded-md">
                    {place.primary_type.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
              {(place.map_uri || place.google_maps_uri) && (
                <motion.a
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  href={place.map_uri || place.google_maps_uri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 hover:text-google-blue shrink-0 p-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  aria-label={`Open place in ${place.map_provider}`}
                >
                  <ExternalLink className="w-5 h-5" />
                </motion.a>
              )}
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed font-medium">
              {place.formatted_address}
            </p>
            
            {showPhoto && place.photo_attributions.length > 0 && (
              <p className="text-xs text-gray-400 mt-5 border-t border-gray-100 dark:border-white/10 pt-3 flex flex-wrap gap-1">
                <span className="opacity-70">Photo by</span>
                {place.photo_attributions.map((attribution, index) => (
                  <span key={`${attribution.display_name}-${index}`}>
                    {index > 0 && ', '}
                    {attribution.uri ? (
                      <a
                        href={attribution.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-google-blue font-semibold transition-colors"
                      >
                        {attribution.display_name}
                      </a>
                    ) : (
                      <span className="font-semibold">{attribution.display_name}</span>
                    )}
                  </span>
                ))}
              </p>
            )}
            
            {place.data_attribution && (
              <p className="text-xs text-gray-400 mt-2 opacity-70">{place.data_attribution}</p>
            )}
          </div>
        </div>
      </motion.article>
    </motion.div>
  )
}
