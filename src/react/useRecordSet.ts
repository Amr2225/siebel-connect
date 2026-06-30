// useRecordSet.ts — the applet's record set as a typed, reactive array.
//
// Subscribes to the applet store and returns `RecordOf<K>[]` for the registered key, re-rendering at
// most once per relevant BC notification batch. Records carry `_indx`, so a row handler can call
// `getApplet(key).positionOnRow(record._indx)` directly.

import { useAppletSelector, recordSetEqual } from './internal'
import type { AppletKey, RecordOf } from 'siebel-connect'

/**
 * Reactive record set for applet `key`, typed by the augmented `AppletRegistry`.
 *
 * ```tsx
 * const rows = useRecordSet('accountList') // readonly Account[]
 * rows.map((r) => <tr key={r.Id} onClick={() => getApplet('accountList').positionOnRow(r._indx as number)}>…</tr>)
 * ```
 *
 * Uses element-wise shallow equality, so an accepted notification that leaves every row unchanged does
 * not re-render; any added/removed/edited row does.
 */
export function useRecordSet<K extends AppletKey>(key: K): readonly RecordOf<K>[] {
  return useAppletSelector(key, (snapshot) => snapshot.recordSet, recordSetEqual)
}
