// Public entry for "siebel-connect/react". The React adapter: typed hooks over the framework-agnostic
// applet store (`createAppletStore`, re-exported from core). Built on `useSyncExternalStoreWithSelector`
// with stable snapshot identity and value-based selectors for minimal re-renders.

export { useApplet, type AppletHandle } from './useApplet'
export { useRecordSet } from './useRecordSet'
export { useCurrentRecord } from './useCurrentRecord'
export { useQueryMode, type QueryMode } from './useQueryMode'
export { useAsyncAction, type AsyncAction } from './useAsyncAction'

// Re-export the store types so consumers of the react entry have them without reaching into core.
export type { AppletStore, AppletSnapshot } from 'siebel-connect'
