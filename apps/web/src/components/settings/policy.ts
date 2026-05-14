/**
 * Settings policy primitives — scope, visibility, edit permission.
 *
 * See galley/docs/settings/ia.md for the scope model. A section or
 * field declares its scope; the shell uses the policy to decide
 * visibility and editability. Default policy today is permissive
 * (single-user, all-visible); multi-user enforcement lands later.
 */

export type SettingsScope = 'user' | 'workspace' | 'module' | 'environment'

export interface PolicyContext {
  /** Display label for the section the policy is evaluated for. */
  scope: SettingsScope
}

/**
 * Returns whether the current user is allowed to edit fields in the
 * given scope. Today: always true (single-user). Replaced when
 * Sunfish kernel-security ships role-based attestation; a section that
 * binds a write to "workspace" scope, for example, would require the
 * user to hold the per-workspace key.
 */
export function canEdit(_scope: SettingsScope): boolean {
  return true
}

/**
 * Returns whether a section should be visible in the current
 * environment. Today: always true. Hook for future per-deployment
 * gating (e.g., hide Integrations when no git remote is configured;
 * hide Danger zone unless a debug flag is set).
 */
export function isVisible(_scope: SettingsScope): boolean {
  return true
}

/**
 * Human-readable scope label for tooltips and section headers.
 */
export function scopeLabel(scope: SettingsScope): string {
  switch (scope) {
    case 'user':
      return 'This device'
    case 'workspace':
      return 'This book'
    case 'module':
      return 'This tool'
    case 'environment':
      return 'This machine'
  }
}

/**
 * Short scope-explanation text used by sections to clarify where their
 * changes will sync.
 */
export function scopeDescription(scope: SettingsScope): string {
  switch (scope) {
    case 'user':
      return 'Saved to this device only.'
    case 'workspace':
      return 'Saved to the book; syncs across your devices when the book is on each one.'
    case 'module':
      return 'Saved per tool family; can be shared across books.'
    case 'environment':
      return 'Saved to this machine. URLs and ports differ per machine, so these stay local.'
  }
}
