// PopupApplet.ts: `PopupApplet<TRecord>` (was `NexusPopupApplet`).
//
// Phase 07 port, translated call-for-call from `_legacy/nexus-bridge/src/NexusPopupApplet.js`.
// Per the corrected hierarchy it extends `BaseApplet` *directly* and is a **sibling** of `Applet`,
// not a child: it adds only the popup-table operations a pick/MVG/association applet exposes
// (`pickRecord`, `addRecords`, `addAllRecords`, `deleteRecords`, `deleteAllRecords`, `_firstRecord`).
//
// Behaviour is unchanged. Only types change, plus the two plan-sanctioned moves shared with
// `BaseApplet`: identifiers drop the `Nexus` prefix (Naming map) and the unconditional `console.log`
// becomes the debug-gated `./logger`. Every PM method-name string (`'PickRecord'`, `'AddRecords'`, …)
// and the battle-tested comments about the Siebel delete/visibility quirks are preserved verbatim.

import BaseApplet from './BaseApplet'
import { log } from './logger'
import type { BaseAppletSettings, SiebelRecord } from './types'

/**
 * Popup applet wrapping a Siebel pick / MVG / association Presentation Model. Adds the record-shuttle
 * operations on top of {@link BaseApplet}; `TRecord` is the popup BC's record shape.
 */
export default class PopupApplet<TRecord extends SiebelRecord = SiebelRecord> extends BaseApplet<TRecord> {
  constructor(settings: BaseAppletSettings) {
    super(settings)
    log('[NB] Popup applet started')
  }

  pickRecord(): unknown {
    return this.pm.ExecuteMethod('InvokeMethod', 'PickRecord')
  }

  deleteRecords(cb?: () => unknown): unknown {
    // method is not allowed to delete the primary for visibility MVG
    //  in this case it returns "Method DeleteRecords is not allowed here" SBL-UIF-00348
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'DeleteRecords')
    if (typeof cb === 'function') {
      cb()
    }
    return ret
  }

  deleteAllRecords(cb?: () => unknown): unknown {
    // method is not deleting the primary for visibility MVG(!) and still returns true
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'DeleteAllRecords')
    if (typeof cb === 'function') {
      cb()
    }
    return ret
  }

  addRecords(cb?: () => unknown): unknown {
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'AddRecords')
    if (typeof cb === 'function') {
      cb()
    }
    return ret
  }

  addAllRecords(cb?: () => unknown): unknown {
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'AddAllRecords')
    if (typeof cb === 'function') {
      cb()
    }
    return ret
  }

  _firstRecord(): unknown {
    // temp method, assumes that no scrolling happened
    if (this.isListApplet) {
      if (this.getSelection() !== 0) {
        return this.positionOnRow(0)
      }
      return true
    }
    return false
  }
}
