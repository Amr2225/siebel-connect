// Notifications.ts — BC-notification subscription engine (ported verbatim from NexusNotifications).
//
// Phase 05 port. The filtering here is subtle and battle-tested (the legacy comments cite real bug
// dates), so it is reproduced line-for-line: the handler set, the accepted/skipped split, the
// `states = ['n']` skip, the `cp`-with-active-MVG/PICK skip, the named-vs-anonymous token semantics,
// and `_attachDebugNotifications`. Only types and the class name change.
//
// One deliberate, Phase-03-sanctioned substitution: the legacy `if (this.debug) console.log('[NB] ...')`
// END diagnostics now route through the pluggable `./logger`, whose `log` is itself gated by the global
// `debug` master switch. The constructor `debug` flag is retained for its other job, deciding whether
// `_attachDebugNotifications` attaches the noisy passthrough handlers (structural, kept verbatim).

import type { SubscriptionToken } from './types'
import { log } from './logger'

/** One captured notification: its constant type plus the raw property set Siebel handed us. */
interface NotificationRecord {
  type: string
  propSet: SiebelPropertySet
}

/** Field-name to control metadata, supplied by the owning applet (Phase 6). Only `uiType` is read. */
export type FieldToControlMap = Record<string, { uiType: string } | undefined>

/** Constructor dependencies, mirroring the legacy `{ pm, consts, fieldToControlMap, debug }`. */
export interface NotificationsOptions {
  pm: SiebelPresentationModel
  consts: SiebelConstants
  fieldToControlMap: FieldToControlMap
  debug?: boolean
}

type Subscriber = () => void

/** Mint a branded {@link SubscriptionToken} from the raw `string | number` the bridge keys subscribers by. */
const brand = (token: string | number): SubscriptionToken => token as SubscriptionToken

export default class Notifications {
  skippedNotifications: NotificationRecord[] = []
  token = 0
  subscribers: { token: string | number; func: Subscriber }[] = []
  debug: boolean | undefined

  constructor({ pm, consts, fieldToControlMap, debug }: NotificationsOptions) {
    let acceptedNotifications: NotificationRecord[] = []
    this.skippedNotifications = []
    this.token = 0
    this.subscribers = []
    this.debug = debug

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_BEGIN'), () => {
      acceptedNotifications = []
      this.skippedNotifications = []
    })

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_NEW_ACTIVE_ROW'), (propSet) => {
      acceptedNotifications.push({
        type: 'SWE_PROP_BC_NOTI_NEW_ACTIVE_ROW',
        propSet,
      })
    })

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_STATE_CHANGED'), (propSet) => {
      // 2022-07-25: cp removed from states, because otherwise on UndoRecord the subscription was not invoked
      // const states = ['cp', 'n']
      const states = ['n']
      const currentState = propSet.GetProperty('state')
      const obj: NotificationRecord = {
        type: 'SWE_PROP_BC_NOTI_STATE_CHANGED',
        propSet,
      }
      if (currentState === 'cp') {
        const activeControl = pm.Get('GetActiveControl') as SiebelControl | null
        // to skip notification when pick/mvg is opened for uncommitted record
        if (
          activeControl &&
          [consts.get('SWE_CTRL_MVG'), consts.get('SWE_CTRL_PICK')].includes(activeControl.GetUIType())
        ) {
          this.skippedNotifications.push(obj)
          return
        }
      }
      if (!states.includes(currentState)) {
        acceptedNotifications.push(obj)
        return
      }
      this.skippedNotifications.push(obj)
    })

    // or SWE_PROP_BC_NOTI_NEW_FIELD_DATA?
    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_NEW_DATA_WS'), (propSet) => {
      const fieldName = propSet.GetProperty(consts.get('SWE_PROP_NOTI_FIELD'))
      const control = fieldToControlMap[fieldName]
      const obj: NotificationRecord = {
        type: 'SWE_PROP_BC_NOTI_NEW_DATA_WS',
        propSet,
      }
      if (
        control &&
        control.uiType !== consts.get('SWE_CTRL_MVG')
        // && control.uiType !== consts.get('SWE_CTRL_PICK')
      ) {
        acceptedNotifications.push(obj)
        return
      }
      this.skippedNotifications.push(obj)
    })

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_DELETE_RECORD'), (propSet) => {
      acceptedNotifications.push({
        type: 'SWE_PROP_BC_NOTI_DELETE_RECORD',
        propSet,
      })
    })

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_NEW_RECORD'), (propSet) => {
      acceptedNotifications.push({
        type: 'SWE_PROP_BC_NOTI_NEW_RECORD',
        propSet,
      })
    })

    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_END'), () => {
      if (acceptedNotifications.length > 0) {
        // Was `if (this.debug) console.log('[NB] ...')`; `log` is gated by the global debug switch.
        log('[NB] acceptedNotifications', acceptedNotifications)
        log('[NB] skippedNotifications', this.skippedNotifications)
        // we assume that the function does not throw an error, so no error handling here
        this._invokeSubscriptions()
      }
    })

    if (debug) {
      this._attachDebugNotifications(pm, consts)
    }
  }

  _invokeSubscriptions(): void {
    this.subscribers.forEach((el) => el.func())
  }

  subscribe(func: Subscriber): SubscriptionToken {
    if (typeof func !== 'function') {
      throw new Error('[NB] func is not a function')
    }
    const functionName = func.name
    if (functionName) {
      // named function, unsubscrie first, and only then subscribe
      this.unsubscribe(functionName)
      this.subscribers.push({ token: functionName, func })
      return brand(functionName)
    }
    // function is anonymous, just subscribe
    this.token += 1
    this.subscribers.push({ token: this.token, func })
    return brand(this.token)
  }

  subIndexOf(subToken: string | number): number {
    return this.subscribers.findIndex((el) => el.token === subToken)
  }

  unsubscribe(subToken: string | number): number {
    const i = this.subIndexOf(subToken)
    if (i > -1) {
      this.subscribers.splice(i, 1)
    }
    return i
  }

  _attachDebugNotifications(pm: SiebelPresentationModel, consts: SiebelConstants): void {
    ;[
      'SWE_NOTIFY_PAGE_REFRESH',
      'SWE_PROP_BC_NEW_ACTIVE_FIELD',
      'SWE_PROP_BC_NOTI_BEGIN_QUERY',
      'SWE_PROP_BC_NOTI_CHANGE_SELECTION',
      'SWE_PROP_BC_NOTI_DELETE_WORKSET',
      'SWE_PROP_BC_NOTI_END_QUERY',
      'SWE_PROP_BC_NOTI_EXECUTE',
      'SWE_PROP_BC_NOTI_GENERIC',
      'SWE_PROP_BC_NOTI_INSERT_WORKSET',
      'SWE_PROP_BC_NOTI_INSERT_WORKSET_FIELD_VALUES',
      'SWE_PROP_BC_NOTI_LONG_OPERATION_PROCESS',
      'SWE_PROP_BC_NOTI_NEW_DATA',
      'SWE_PROP_BC_NOTI_NEW_FIELD_DATA',
      'SWE_PROP_BC_NOTI_NEW_FIELD_LIST',
      'SWE_PROP_BC_NOTI_NEW_FIELD_QUERYSPEC',
      'SWE_PROP_BC_NOTI_NEW_PRIMARY',
      'SWE_PROP_BC_NOTI_NEW_QUERYSPEC',
      'SWE_PROP_BC_NOTI_NEW_RECORD_DATA',
      'SWE_PROP_BC_NOTI_NEW_RECORD_DATA_WS',
      'SWE_PROP_BC_NOTI_NEW_RECORD_SCROLL_DATA',
      'SWE_PROP_BC_NOTI_NEW_SELECTION',
      'SWE_PROP_BC_NOTI_PAGE_REFRESH',
      'SWE_PROP_BC_NOTI_SCROLL_AMOUNT',
      'SWE_PROP_BC_NOTI_SELECTION_MODE_CHANGE',
      'SWE_PROP_NOTI_SELECTED',
      'SWE_PROP_IS_IN_QUERY',
      'SWE_NOTIFY_TOTALS_CHANGED',
      'SWE_PROP_BC_NOTI_ACTIVE_ROW',
    ].forEach((type) => {
      pm.AttachNotificationHandler(consts.get(type), (propSet) => {
        this.skippedNotifications.push({
          type,
          propSet,
        })
      })
    })
  }
}
