import {
  type ProsePreset,
  type VoicePassMode,
  useActiveBookPrefs,
  useEditorialPrefs,
} from '@/api/editorialPrefs'
import { SettingsSection } from '../SettingsSection'
import { AdvancedDisclosure } from '../AdvancedDisclosure'
import { RadioField } from '../fields/RadioField'
import { TextField } from '../fields/TextField'

/**
 * Editorial section — second reference implementation, stress-tests the
 * primitive API with three-mode radio choices and shows how a per-book
 * (workspace-scoped) store wires up.
 *
 * Persistence today: localStorage via useEditorialPrefs. The book-server
 * write-through and yaml sync are documented as next steps in the store
 * module header.
 */
export function EditorialSection() {
  const activeBookId = useEditorialPrefs((s) => s.activeBookId)
  const setPref = useEditorialPrefs((s) => s.setPref)
  const prefs = useActiveBookPrefs()

  return (
    <SettingsSection
      title="Editorial"
      numeral="IV"
      description={`Prose-review register, voice-pass behavior, and narrator voice for the active book — currently editing ${activeBookId}.`}
      scope="workspace"
    >
      <TextField
        label="Active voice"
        value={prefs.activeVoice}
        onChange={(v) => setPref(activeBookId, 'activeVoice', v)}
        placeholder="anna"
        helperText="Voice identifier the prose pipeline calibrates against. Should match one of the book's registered voices in book.editorial.yaml."
      />
      <RadioField<ProsePreset>
        label="Prose-review preset"
        value={prefs.prosePreset}
        onChange={(v) => setPref(activeBookId, 'prosePreset', v)}
        options={[
          {
            value: 'gentle',
            label: 'gentle',
            consequence:
              'Surface only the highest-confidence findings. Long passages of intentional rhetoric stay quiet.',
          },
          {
            value: 'standard',
            label: 'standard',
            consequence:
              'Default thresholds across the detector catalog. Most prose reviews land here.',
          },
          {
            value: 'strict',
            label: 'strict',
            consequence:
              'Lower thresholds across the board. Useful for late-stage editing or when a manuscript has known density problems.',
          },
        ]}
        helperText="Maps to per-detector thresholds inside the prose-telemetry pipeline."
      />
      <RadioField<VoicePassMode>
        label="Voice-pass mode"
        value={prefs.voicePassMode}
        onChange={(v) => setPref(activeBookId, 'voicePassMode', v)}
        options={[
          {
            value: 'off',
            label: 'off',
            consequence:
              'No voice-pass suggestions. The pipeline still flags issues for prose-review; voice-pass agents stay idle.',
          },
          {
            value: 'read-only',
            label: 'read-only',
            consequence:
              'Voice-pass agents surface rewrite suggestions inline. Nothing is committed until you approve each edit.',
          },
          {
            value: 'auto-apply',
            label: 'auto-apply',
            consequence:
              'Voice-pass agents rewrite flagged passages directly. Use only with held-lines coverage and a recent commit you can revert to.',
          },
        ]}
        helperText="Behavior of the voice-pass agent when it encounters flagged prose."
      />
      <AdvancedDisclosure label="show per-detector overrides" expandedLabel="hide per-detector overrides">
        <p className="gs-placeholder" style={{ marginTop: 0 }}>
          Per-detector threshold tuning lands here in a follow-up — an
          editable table mirroring the detectors documented in
          galley/prose/docs/FEATURES.md. Today the preset radio above is
          the only knob; that covers 99% of editorial workflows.
        </p>
        <p className="gs-placeholder" style={{ marginTop: 0 }}>
          Custom motif lists (retired phrases, capped phrases,
          self-referential frame catalogue) also land here once the per-book
          yaml editor is built. Until then, edit
          <code> galley/prose/books/{`<book>`}.yaml </code>
          by hand.
        </p>
      </AdvancedDisclosure>
    </SettingsSection>
  )
}
