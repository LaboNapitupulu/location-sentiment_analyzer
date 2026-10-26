import { useState, useEffect } from 'react'
import { ExternalLink, ImageOff, MapPin, Navigation } from 'lucide-react'
import { motion } from 'framer-motion'

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

  const mapLink = place.map_uri || place.google_maps_uri

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
      className="mt-6 w-full max-w-2xl mx-auto"
    >
      <article className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-elevated dark:shadow-elevated-dark overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
          
          {/* Media preview section */}
          <div className="h-44 sm:h-full min-h-[11rem] bg-slate-100 dark:bg-slate-800/60 relative overflow-hidden">
            {showPhoto ? (
              <img
                src={place.photo_url ?? ''}
                alt={`Photo of ${place.display_name}`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : hasCoordinates ? (
              <div className="absolute inset-0 w-full h-full bg-blue-50/50 dark:bg-slate-800">
                <iframe
                  src={mapPreviewUrl}
                  title={`Map of ${place.display_name}`}
                  className="absolute inset-0 w-full h-full border-0 opacity-80"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-slate-400">
                <ImageOff className="w-7 h-7 mb-1.5 opacity-60" />
                <span className="text-xs font-medium">No photo available</span>
              </div>
            )}
          </div>

          {/* Place details section */}
          <div className="p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
                    {place.display_name}
                  </h3>
                  {place.primary_type && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {place.primary_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                {mapLink && (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    title={`Open in ${place.map_provider || 'Maps'}`}
                    aria-label={`Open in ${place.map_provider || 'Maps'}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-3 leading-relaxed flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{place.formatted_address}</span>
              </p>
            </div>

            {/* Coordinates and photo attribution */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              {hasCoordinates && (
                <span className="flex items-center gap-1 font-mono">
                  <Navigation className="w-3 h-3 text-slate-400" />
                  {(place.latitude as number).toFixed(4)}, {(place.longitude as number).toFixed(4)}
                </span>
              )}

              {showPhoto && place.photo_attributions.length > 0 && (
                <span className="truncate max-w-[200px]">
                  Photo: {place.photo_attributions[0].display_name}
                </span>
              )}
            </div>

          </div>
        </div>
      </article>
    </motion.div>
  )
}
