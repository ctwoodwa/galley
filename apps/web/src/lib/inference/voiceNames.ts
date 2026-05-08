// Language prefixes that appear before the meaningful name in voice IDs (e.g. en_woman)
const LANG_PREFIXES = new Set(['en', 'fr', 'de', 'es', 'it', 'ja', 'zh', 'ko', 'pt', 'ar', 'ru', 'nl', 'pl', 'tr', 'sv'])

/**
 * Converts a technical voice ID into a human-readable display name.
 * en_woman → "Woman"   |   my_custom_voice → "My Custom Voice"   |   narrator_1 → "Narrator 1"
 */
export function prettifyVoiceId(id: string): string {
  const parts = id.split(/[_-]/)
  const rest = parts.length >= 2 && parts[0].length === 2 && LANG_PREFIXES.has(parts[0])
    ? parts.slice(1)
    : parts
  return rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
