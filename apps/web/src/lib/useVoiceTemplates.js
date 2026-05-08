import { useCallback, useEffect, useState } from 'react'
import {
  listTemplates,
  getDefaults,
  setDefaultFor as setDefaultForRaw,
  getTemplateForTier,
  createTemplate as createRaw,
  updateTemplate as updateRaw,
  deleteTemplate as deleteRaw,
} from './voice-templates'

/**
 * React hook for the voice-template store. Single source of truth for
 * everywhere in the app that needs to map "Fast" or "Quality" to concrete
 * synthesis parameters. Operations re-read localStorage so multiple tabs
 * eventually converge after navigation; explicit cross-tab sync deferred.
 */
export function useVoiceTemplates() {
  const [templates, setTemplates] = useState(() => listTemplates())
  const [defaults, setDefaults] = useState(() => getDefaults())

  const refresh = useCallback(() => {
    setTemplates(listTemplates())
    setDefaults(getDefaults())
  }, [])

  // Listen for storage events from other tabs / settings UI.
  useEffect(() => {
    const onStorage = (e) => {
      if (
        e.key === 'galley.voice-templates.v1' ||
        e.key === 'galley.voice-template-defaults.v1'
      ) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const create = useCallback((template) => {
    const created = createRaw(template)
    refresh()
    return created
  }, [refresh])

  const update = useCallback((id, patch) => {
    const updated = updateRaw(id, patch)
    refresh()
    return updated
  }, [refresh])

  const remove = useCallback((id) => {
    deleteRaw(id)
    refresh()
  }, [refresh])

  const setDefault = useCallback((tier, id) => {
    setDefaultForRaw(tier, id)
    refresh()
  }, [refresh])

  const forTier = useCallback((tier) => getTemplateForTier(tier), [])

  return { templates, defaults, refresh, create, update, remove, setDefault, forTier }
}
