/* Music-library types — mirror /api/v1/music/* on the Windows inference server. */

export type TrackSource =
  | 'Silverman Sound'
  | 'Incompetech'
  | 'Musopen'
  | 'Local upload'
  | 'Other'

export type TrackGenre =
  | 'Ambient' | 'Cinematic' | 'Classical' | 'Folk' | 'Jazz' | 'Electronic' | 'Upbeat' | 'SFX'

export type TrackMood =
  | 'Calm' | 'Melancholic' | 'Hopeful' | 'Tense' | 'Dramatic' | 'Playful' | 'Neutral'

export type SortBy = 'added' | 'title' | 'artist' | 'duration' | 'plays'
export type ViewMode = 'list' | 'grid'
export type Section = 'all' | 'favorites' | `source:${string}` | `genre:${string}`

export interface Track {
  id: string
  title: string
  artist: string
  source: TrackSource
  source_url: string
  genre: TrackGenre
  mood: TrackMood
  tags: string[]
  duration: number
  license: string
  attribution: string
  added: string
  plays: number
  color: string
  favorite: boolean
  file_path?: string
  file_size?: number
  bitrate?: number
  fmt?: string
}

export interface LibraryStats {
  total: number
  favorites: number
  by_source: Record<string, number>
  by_genre: Record<string, number>
}

export interface TracksResponse {
  tracks: Track[]
  total: number
}

export interface SilvermanTrack {
  title: string
  artist: string
  source: string
  mp3_url: string
  artwork_url: string
  duration: number
  duration_str: string
  genre: string
  mood: string
  tags: string[]
  post_id: string
  license: string
  attribution: string
}

export const GENRES: readonly TrackGenre[] = [
  'Ambient', 'Cinematic', 'Classical', 'Folk', 'Jazz', 'Electronic', 'Upbeat', 'SFX',
] as const

export const MOODS: readonly TrackMood[] = [
  'Calm', 'Melancholic', 'Hopeful', 'Tense', 'Dramatic', 'Playful', 'Neutral',
] as const

export const SOURCE_DOT: Record<string, string> = {
  'Silverman Sound': '#8a9a6f',
  Incompetech:       '#c87070',
  Musopen:           '#6a8a98',
  'Local upload':    '#9a8a4a',
  Other:             '#7a7a7a',
}
