// useCurrentRecord.ts: the applet's currently selected record as a reactive slice.
//
// Subscribes to the applet store and returns the selected `RecordOf<K>` (or `undefined` when nothing
// is selected). Shallow equality on the record means a component reading one field re-renders only
// when that record's fields actually change, ignoring an accepted-but-unrelated notification.

import { useAppletSelector, shallowEqual } from './internal'
import type { AppletKey, RecordOf } from 'siebel-connect'

/**
 * Reactive current record for applet `key`, typed by the augmented `AppletRegistry`.
 *
 * ```tsx
 * const account = useCurrentRecord('accountForm') // Account | undefined
 * return <span>{account?.Name}</span>
 * ```
 *
 * Uses shallow equality, so two distinct record objects with identical fields compare equal and skip
 * the re-render; this is what keeps `account?.Name` stable across unrelated record-set churn.
 */
export function useCurrentRecord<K extends AppletKey>(key: K): RecordOf<K> | undefined {
  return useAppletSelector(key, (snapshot) => snapshot.currentRecord, shallowEqual)
}
