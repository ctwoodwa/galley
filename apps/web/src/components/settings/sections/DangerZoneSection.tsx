import { useState } from 'react'
import { Eraser, FileMinus, Bomb } from 'lucide-react'
import { useApiConfig } from '@/api/config'
import { useEditorialPrefs } from '@/api/editorialPrefs'
import { useBookRegistry } from '@/api/bookRegistry'
import { SettingsSection } from '../SettingsSection'
import { ActionField } from '../fields/ActionField'
import { ConfirmDialog } from '../ConfirmDialog'

/**
 * Danger zone — destructive resets behind ConfirmDialog. Three actions
 * scoped from least to most destructive:
 *
 *   1. Reset services config  — rebuilds the capability slot map from
 *      defaults. Editorial prefs and book registry untouched.
 *   2. Reset editorial prefs  — resets the active book's per-book
 *      editorial prefs (preset, voice-pass mode, narrator). Other
 *      books' prefs untouched.
 *   3. Clear all local state  — nukes every galley.* localStorage key
 *      and reloads. Bookkeeping for repos on disk is unaffected; this
 *      is purely a galley-side wipe.
 *
 * Every action is wrapped in a destructive ConfirmDialog. After the
 * action completes a "what just happened" result line shows on the
 * field so the user sees positive confirmation without a stale modal.
 */

type PendingAction = 'services' | 'editorial' | 'all' | null

export function DangerZoneSection() {
  const resetApiConfig = useApiConfig((s) => s.reset)
  const resetPrefs = useEditorialPrefs((s) => s.resetPrefs)
  const activeBookId = useBookRegistry((s) => s.activeBookId)

  const [pending, setPending] = useState<PendingAction>(null)
  const [servicesResult, setServicesResult] = useState<string | null>(null)
  const [editorialResult, setEditorialResult] = useState<string | null>(null)

  const doResetServices = () => {
    resetApiConfig()
    setServicesResult('Services config restored to defaults.')
  }
  const doResetEditorial = () => {
    resetPrefs(activeBookId)
    setEditorialResult(`Editorial prefs reset for "${activeBookId}".`)
  }
  const doClearAll = () => {
    // The persist middleware writes one key per store. Wipe them all
    // and reload — the stores will re-hydrate with their defaults.
    try {
      window.localStorage.removeItem('galley.api-config')
      window.localStorage.removeItem('galley.editorial-prefs')
      window.localStorage.removeItem('galley.book-registry')
    } catch {
      // Private mode / disabled storage — nothing to wipe.
    }
    window.location.reload()
  }

  return (
    <SettingsSection
      title="Danger zone"
      numeral="VIII"
      description="Destructive resets. Nothing here touches book repos on disk — only galley's local view (capability slot map, editorial prefs, book registry) is affected."
      scope="environment"
    >
      <ActionField
        label="Reset services config"
        description="Restores every capability slot's URL, provider, and bearer token to factory defaults. Editorial prefs and book registry untouched."
        buttonLabel="Reset services"
        icon={<Eraser size={13} />}
        destructive
        onClick={() => setPending('services')}
        resultMessage={servicesResult}
        resultKind="success"
      />

      <ActionField
        label="Reset editorial prefs for active book"
        description={`Resets the active book ("${activeBookId}") prose-review preset, voice-pass mode, and narrator voice to defaults. Other books' prefs are untouched.`}
        buttonLabel="Reset prefs"
        icon={<FileMinus size={13} />}
        destructive
        onClick={() => setPending('editorial')}
        resultMessage={editorialResult}
        resultKind="success"
        disabled={!activeBookId}
      />

      <ActionField
        label="Clear all local state"
        description="Wipes galley's localStorage entries (api-config, editorial-prefs, book-registry) and reloads. Book repos on disk are not touched."
        buttonLabel="Clear and reload"
        icon={<Bomb size={13} />}
        destructive
        onClick={() => setPending('all')}
      />

      <ConfirmDialog
        open={pending === 'services'}
        onClose={() => setPending(null)}
        onConfirm={doResetServices}
        title="Reset services config?"
        description={
          <p>
            Every capability slot's URL, provider, and bearer token will
            be restored to factory defaults. Workers on other machines
            stay running — you'll just need to re-point galley at them.
          </p>
        }
        confirmLabel="Reset services"
        confirmKind="destructive"
      />

      <ConfirmDialog
        open={pending === 'editorial'}
        onClose={() => setPending(null)}
        onConfirm={doResetEditorial}
        title={`Reset editorial prefs for "${activeBookId}"?`}
        description={
          <p>
            The prose-review preset, voice-pass mode, and narrator voice
            for this book will go back to defaults. Other books' prefs
            are untouched.
          </p>
        }
        confirmLabel="Reset prefs"
        confirmKind="destructive"
      />

      <ConfirmDialog
        open={pending === 'all'}
        onClose={() => setPending(null)}
        onConfirm={doClearAll}
        title="Clear all galley local state?"
        description={
          <>
            <p>
              This wipes everything galley has stored in localStorage —
              the capability slot map, every book's editorial prefs, and
              the book registry — then reloads the page.
            </p>
            <p>
              Book repos on disk are <strong>not</strong> touched. Files,
              YAML profiles, prose drafts — all safe. Only galley's
              local view of them is reset.
            </p>
          </>
        }
        confirmLabel="Clear and reload"
        confirmKind="destructive"
      />
    </SettingsSection>
  )
}
