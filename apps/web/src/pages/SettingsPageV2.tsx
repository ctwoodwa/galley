import { Sliders, Server, BookOpen, Bell, Plug, Cog, AlertOctagon, UserCircle } from 'lucide-react'
import {
  SettingsShell,
  type SettingsSectionDef,
  ServicesSection,
} from '@/components/settings'

/**
 * Reference page that hosts the new SettingsShell with the registered
 * sections. Not yet wired into the router — exists as a demonstration
 * of the IA primitives. The legacy SettingsDrawer at
 * `pages/inference/SettingsDrawer.tsx` continues to serve the
 * production UI until a follow-up PR replaces it.
 */
export function SettingsPageV2() {
  const sections: SettingsSectionDef[] = [
    {
      id: 'account',
      label: 'Account',
      icon: <UserCircle className="w-4 h-4" />,
      scope: 'user',
      Component: PlaceholderSection('Account', 'Identity, theme, and bearer-token rotation.'),
    },
    {
      id: 'books',
      label: 'Books',
      icon: <BookOpen className="w-4 h-4" />,
      scope: 'workspace',
      Component: PlaceholderSection('Books', 'Active book, per-book profile registry, held-lines pointer.'),
    },
    {
      id: 'services',
      label: 'Services',
      icon: <Server className="w-4 h-4" />,
      scope: 'environment',
      Component: ServicesSection,
    },
    {
      id: 'editorial',
      label: 'Editorial',
      icon: <Sliders className="w-4 h-4" />,
      scope: 'workspace',
      Component: PlaceholderSection('Editorial', 'Prose-review preset, voice-pass mode, per-detector overrides.'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      scope: 'user',
      Component: PlaceholderSection('Notifications', 'Render-complete, voice-pass progress, sync-state alerts.'),
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Plug className="w-4 h-4" />,
      scope: 'environment',
      Component: PlaceholderSection('Integrations', 'Git remote(s), Tailscale status, book repo paths.'),
    },
    {
      id: 'advanced',
      label: 'Advanced',
      icon: <Cog className="w-4 h-4" />,
      scope: 'environment',
      Component: PlaceholderSection('Advanced', 'Env-var overrides, schema migration, debug-log toggle.'),
    },
    {
      id: 'danger',
      label: 'Danger zone',
      icon: <AlertOctagon className="w-4 h-4 text-destructive" />,
      scope: 'environment',
      Component: PlaceholderSection('Danger zone', 'Clear local state, force re-pair, delete book registry entry.'),
    },
  ]

  return (
    <div className="h-screen w-screen">
      <SettingsShell sections={sections} initialSectionId="services" />
    </div>
  )
}

function PlaceholderSection(title: string, description: string) {
  return function PlaceholderImpl() {
    return (
      <div className="max-w-3xl mx-auto px-8 py-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        <p className="text-xs text-muted-foreground mt-6 italic">
          Section deferred — see <code>docs/settings/ia.md</code> for the spec.
        </p>
      </div>
    )
  }
}
