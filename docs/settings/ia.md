# Galley Settings — Information Architecture

This doc specifies the settings UX patterns galley follows, the
section-by-section content map, and the component primitives that
implement it. It's the source of truth for "where should this setting
live?" and "how should this control look?" decisions.

The framework is task-first, progressively disclosed. Users find the
section that matches what they're trying to do, see the common
preferences for that task immediately, and can reveal advanced or
risky controls behind clearly-labeled disclosure.

## Top-level sections

Settings opens to a left-nav with these sections (always in this order;
hidden when a section has no fields the current user is allowed to see):

| Section | What it covers | Primary scope |
|---|---|---|
| **Account** | Identity, theme, bearer-token rotation | User |
| **Books** | Active book picker, per-book profile registry, held-lines pointer | Workspace + User |
| **Services** | Capability slots (`tts/fast`, `tts/quality`, `stt/*`, `image`, `music`) | Environment |
| **Editorial** | Prose-telemetry preset, voice-pass mode, per-detector overrides | Workspace |
| **Audio** | Audiobook pipeline preferences (voice, sample rate, loudness, ID3) | Workspace + User |
| **Notifications** | Render-complete, sync-state, voice-pass progress | User |
| **Integrations** | Git remote(s), Tailscale status (read-only), book repo paths | Environment |
| **Advanced** | Env-var overrides, schema migration, persist version, reset | Environment |
| **Danger zone** | Clear local state, force re-pair, delete book registry entry | Environment + User |

`Danger zone` is its own bottom-of-nav entry rather than a subsection
of Advanced so destructive actions can't be reached by accident while
exploring power-user options.

## Per-section content map

For each section, the **Shallow** column lists what shows on first load;
**Advanced** lists what's behind a "Show advanced" disclosure within
the section.

### Account

| Shallow | Advanced |
|---|---|
| Display name, theme (light/dark/system) | Bearer-token rotation, device keypair display/export, recovery passphrase setup (when pairing lands) |

### Books

| Shallow | Advanced |
|---|---|
| Active book picker, "Add book…" button, list of registered books | Per-book yaml location override, held-lines dir override, per-book stopword editor, motif list editor |

### Services

| Shallow | Advanced |
|---|---|
| Per-slot card: capability id, provider label, base URL, enabled toggle, "Test" button | Per-slot api key (secret), flavor override, custom path prefix, request timeout, retry count. Shared-default fallback (baseUrl + apiKey at config root) |

The Services section is the **reference implementation** for the
settings primitives — it exercises every field type and uses
progressive disclosure both at the section level (shared-default
fallback as a collapsed group) and at the per-slot level (advanced
disclosure per slot).

### Editorial

| Shallow | Advanced |
|---|---|
| Active voice, prose-review severity preset (`gentle` / `standard` / `strict`), voice-pass mode (`off` / `read-only` / `auto-apply`) | Per-detector threshold overrides, held-lines path override, custom motif lists, AI-vocab cluster customization |

The "preset" pattern is the key win for Editorial — the typical user
picks `standard`, and the 1% who need to tune
`lexical_chain_loop.warning_per_1k` open Advanced.

### Audio

| Shallow | Advanced |
|---|---|
| Default voice, sample rate preset (16k / 24k / 48k), output format (mp3 / wav / m4a), default loudness target | Custom render pipeline steps, alignment model, silence-trim params, ID3 tag templates, chapter-split rules |

### Notifications

| Shallow | Advanced |
|---|---|
| Render-complete (toggle), voice-pass progress (toggle), sync-state alerts (toggle) | Notification channel (desktop / browser-tab / system-tray), debounce interval, mute-when-focused toggle |

### Integrations

| Shallow | Advanced |
|---|---|
| Git remote URL (read-only after init), Tailscale status indicator, book repo paths | Per-remote auth method, sync daemon poll interval, conflict resolution policy, federated peer list (when Sunfish kernel-sync lands) |

### Advanced

| Shallow | Advanced |
|---|---|
| Env-var override viewer (which `VITE_*` vars override defaults), persist version | Reset persist state (drops to defaults), schema migration force-rerun, debug-log toggle |

### Danger zone

| Shallow | Advanced |
|---|---|
| (none — every control in this section is shallow, but each requires explicit confirmation) | n/a |

Danger zone controls: clear local state, force re-pair, delete book
registry entry. Each requires a typed-confirmation dialog
("Type `delete` to continue") and is visually distinguished by red
borders and stronger spacing.

## Field-type rules

| Field type | When to use | Galley-side component |
|---|---|---|
| **Toggle** | Immediate on/off, no consequences beyond the flag | `ToggleField` |
| **Radio** | 2–4 mutually exclusive modes with consequences | `RadioField` |
| **Select** | 5+ options or extensible (sorted lists, voices) | `SelectField` |
| **Text** | Free input with validation (URLs, names, paths) | `TextField` |
| **Secret** | Tokens, keys — masked, never re-displayed once written | `SecretField` |
| **List** | Variable-length ordered/unordered | `ListField` |
| **File path** | OS path picker | `PathField` (placeholder for native picker integration) |
| **Action** | Buttons that trigger irreversible or async work | `ActionField` (button with optional confirm dialog) |

### Toggle vs. Radio vs. Select — the consequence test

- **Toggle** when flipping the value has *no consequence beyond the
  flag itself*. Example: "Show prose-metrics chip" — the chip is hidden
  or shown.
- **Radio** when each option *changes behavior in a different way* and
  the user needs to see all options at once to choose. Example: voice-
  pass mode `off` / `read-only` / `auto-apply`.
- **Select** when there are too many options for radio (5+) or the
  option set is dynamic. Example: voice picker.

Following this rule strictly prevents the "toggle that's actually
hiding three modes" anti-pattern.

## Validation + save semantics

- **Inline save per section.** No global "Save" button. Each section
  saves its fields on change (debounced, ~400ms after last keystroke
  for text fields; immediate for toggles / radios).
- **Save state visible per section.** Three states: `saved` (default,
  faint), `saving` (spinner, transient), `unsaved-error` (red badge if
  validation fails). The state lives in the section header.
- **Validation is field-local first, section-wide second.** A URL
  field validates URL format on change; a section can also validate
  cross-field rules ("Both `baseUrl` and `apiKey` must be set or
  both empty") and surface a section-level error in the header.
- **Validation uses Zod schemas.** Field-level schemas live with the
  field's `policy`; section-level cross-field rules live with the
  section.
- **Failed validation does not block save of the rest.** Each field
  saves independently; a broken URL doesn't prevent the toggle in the
  same section from saving.

## Scope mapping (where each setting lives)

| Scope | Where it persists | Who can edit | Examples |
|---|---|---|---|
| **User** | `localStorage` on this device | The user themselves | Display name, theme, notification preferences, active-book selection |
| **Workspace** | Per-book yaml (committed to book repo) | Anyone editing the book | Active voice, prose-review preset, per-detector thresholds, motif lists |
| **Module** | Per-tool-family yaml or shared user prefs | Power user | Audiobook pipeline steps, alignment model choice |
| **Environment** | `localStorage` on this device | The user themselves (per-device) | Service slot URLs, Tailscale-related preferences, env-var visibility |

Scope is a property of the section (`<SettingsSection scope="environment">`),
not of individual fields. A section that mixes scopes (e.g., Books has
both Workspace per-book entries and User active-book pick) is allowed
but should make the boundary visually clear with subsection headers.

When kernel-sync lands (Sunfish Wave 4+), Workspace-scope settings flow
through CRDT sync; User and Environment scope stay local. Module scope
defaults to Workspace but can be configured per-tool-family.

## Component primitives

Three layers of components implement the IA:

### `SettingsShell`

The chrome: left nav, search input, breadcrumbs, the active-section
slot. Manages section visibility (filtered by search and by policy).

```tsx
<SettingsShell sections={ALL_SECTIONS} initialSectionId="services">
  {/* renders the active section */}
</SettingsShell>
```

### `SettingsSection<TState>`

One task-based section. Owns its save state (`saved` / `saving` /
`unsaved-error`), section-level validation, and the per-section
"Show advanced" disclosure.

```tsx
<SettingsSection
  title="Services"
  description="Capability slots route inference work to specific workers."
  scope="environment"
>
  <YourFieldsHere />
  <AdvancedDisclosure>
    {/* hidden by default */}
  </AdvancedDisclosure>
</SettingsSection>
```

### `SettingsField`

Typed-primitive form controls. The base interface:

```tsx
interface SettingsFieldProps<TValue> {
  label: string
  value: TValue
  onChange: (next: TValue) => void
  helperText?: string
  error?: string
  disabled?: boolean
  required?: boolean
}
```

Concrete implementations: `ToggleField`, `RadioField`, `SelectField`,
`TextField`, `SecretField`, `ListField`, `PathField`, `ActionField`.

### `SettingsPolicy`

Not a component — a small TS module providing:

```ts
function canEdit(scope: SettingsScope, user: User): boolean
function visibleIn(env: Environment, field: SettingsField): boolean
```

Plus type-level scope enum:

```ts
type SettingsScope = 'user' | 'workspace' | 'module' | 'environment'
```

Sections and fields declare their scope; the shell filters visibility
based on policy. Default policy (today, single-user): everything is
visible and editable. Multi-user/permission policy enforcement lands
later.

## File layout (galley today)

```
apps/web/src/components/settings/
├── index.ts                     — public exports
├── SettingsShell.tsx
├── SettingsSection.tsx
├── AdvancedDisclosure.tsx
├── policy.ts                    — scope types + helpers
├── fields/
│   ├── ToggleField.tsx
│   ├── RadioField.tsx
│   ├── SelectField.tsx
│   ├── TextField.tsx
│   ├── SecretField.tsx
│   ├── ListField.tsx           (deferred — used by future Editorial section)
│   └── ActionField.tsx
└── sections/
    └── ServicesSection.tsx     — reference section using all primitives

apps/web/src/pages/
└── SettingsPageV2.tsx           — hosts SettingsShell; not yet wired to router
```

When the primitive API stabilizes (after 2–3 sections land), the
`components/settings/` tree promotes to `@galley/ui` and the API
becomes a candidate for upstream to Sunfish's `foundation-ui-settings`
package alongside `foundation-ui-syncstate`.

## Section authoring contract

A new section is one file under `sections/`. The contract:

```tsx
import { SettingsSection } from '../SettingsSection'

export function MySection() {
  // Read settings from store(s), wire onChange handlers.
  return (
    <SettingsSection title="..." description="..." scope="...">
      <ToggleField ... />
      <TextField ... />
      <AdvancedDisclosure>
        <SecretField ... />
      </AdvancedDisclosure>
    </SettingsSection>
  )
}
```

A new section also registers in the section list (`SettingsShell`'s
`sections` prop) with its id, label, icon, scope, and component.

## What this doc deliberately doesn't cover

- **Theming primitives** — colors, type scale, spacing. Owned by
  `apps/web/tailwind.config.ts`. Settings UI consumes these tokens.
- **i18n** — labels are English-only today. Localization plumbing
  arrives with the Sunfish-side localization story.
- **A11y testing strategy** — keyboard nav, screen reader labels.
  Each field implementation handles these inline; a separate a11y
  audit doc captures the test plan.
- **Migration UX** — when persist version bumps, what does the user
  see? Today the migration runs silently; a future PR adds a banner
  ("We upgraded your settings from v2 to v3 — review the new Services
  section") if needed.

## References

The patterns in this doc draw from established settings-UX research on
task-based IA, progressive disclosure, and field-type discipline. The
specific application to galley + Sunfish's layered model is
project-specific; the general patterns are well-documented elsewhere.
