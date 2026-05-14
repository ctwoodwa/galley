import { Sliders, Server, BookOpen, Bell, Plug, Cog, AlertOctagon, UserCircle } from 'lucide-react'
import {
  SettingsShell,
  type SettingsSectionDef,
  ServicesSection,
  SettingsSection,
  type SettingsScope,
} from '@/components/settings'

/**
 * Reference page hosting the editorial-letterpress settings shell.
 * Most sections are placeholders today; Services is the reference
 * implementation. Reachable at /settings.
 */
export function SettingsPageV2() {
  const sections: SettingsSectionDef[] = [
    {
      id: 'account',
      label: 'Account',
      icon: <UserCircle size={14} />,
      scope: 'user',
      Component: PlaceholderSection(
        'I',
        'Account',
        'Identity, theme, bearer-token rotation, device keypair.',
        'user',
      ),
    },
    {
      id: 'books',
      label: 'Books',
      icon: <BookOpen size={14} />,
      scope: 'workspace',
      Component: PlaceholderSection(
        'II',
        'Books',
        'Active book, per-book profile registry, held-lines pointer.',
        'workspace',
      ),
    },
    {
      id: 'services',
      label: 'Services',
      icon: <Server size={14} />,
      scope: 'environment',
      Component: ServicesSection,
    },
    {
      id: 'editorial',
      label: 'Editorial',
      icon: <Sliders size={14} />,
      scope: 'workspace',
      Component: PlaceholderSection(
        'IV',
        'Editorial',
        'Prose-review preset, voice-pass mode, per-detector overrides.',
        'workspace',
      ),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell size={14} />,
      scope: 'user',
      Component: PlaceholderSection(
        'V',
        'Notifications',
        'Render-complete, voice-pass progress, sync-state alerts.',
        'user',
      ),
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Plug size={14} />,
      scope: 'environment',
      Component: PlaceholderSection(
        'VI',
        'Integrations',
        'Git remote(s), Tailscale status, book repo paths.',
        'environment',
      ),
    },
    {
      id: 'advanced',
      label: 'Advanced',
      icon: <Cog size={14} />,
      scope: 'environment',
      Component: PlaceholderSection(
        'VII',
        'Advanced',
        'Env-var overrides, schema migration, debug-log toggle.',
        'environment',
      ),
    },
    {
      id: 'danger',
      label: 'Danger zone',
      icon: <AlertOctagon size={14} />,
      scope: 'environment',
      Component: PlaceholderSection(
        'VIII',
        'Danger zone',
        'Clear local state, force re-pair, delete book registry entry.',
        'environment',
      ),
    },
  ]

  return <SettingsShell sections={sections} initialSectionId="services" />
}

function PlaceholderSection(
  numeral: string,
  title: string,
  description: string,
  scope: SettingsScope,
) {
  return function PlaceholderImpl() {
    return (
      <SettingsSection
        title={title}
        numeral={numeral}
        description={description}
        scope={scope}
      >
        <p className="gs-placeholder">
          Section deferred. See <code>docs/settings/ia.md</code> for the
          shallow/advanced split this section will adopt when wired.
        </p>
      </SettingsSection>
    )
  }
}
