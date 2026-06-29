// PopupController.ts: popup controller singleton (was `NexusPopupController`).
//
// Phase 07 port, translated call-for-call from `_legacy/nexus-bridge/src/NexusPopupController.js`.
// This is the highest-risk module in the bridge: the `ProcessNewPopup` monkey-patch and the
// `reInitPopupPM` PM-lifecycle dance (`EndLife -> constructor -> Init -> Setup`) are deeply
// Siebel-version-sensitive, so they are copied **exactly**, comments and all. No logic changed.
//
// Plan-sanctioned moves only:
//   1. Types. The tracked applet instances, the resolve payload, and the `IsPopupOpen` result are
//      typed (see `PopupResolution` / `PopupOpenState` in ./types).
//   2. Typed errors. String throws become `ConnectError` subclasses with the *exact* original message:
//      `MethodNotSupportedError` for the `CloseApplet` guard, `PopupError` for the "not opened by NB"
//      and "not found in OnLoadPopupContent" cases, base `ConnectError` for the unreachable branch.
//      The Symbol-enforcer throw stays a plain `Error`, matching the sibling `LocaleData` singleton.
//   3. Diagnostics. The legacy `console.log/warn` route through the debug-gated ./logger.
//
// The Symbol-enforcer singleton (req #4) is preserved: `PopupController.instance` is the only
// sanctioned constructor caller; `new PopupController()` throws.

import PopupApplet from './PopupApplet'
import { log, warn } from './logger'
import { ConnectError, MethodNotSupportedError, PopupError } from './errors'
import type { BaseAppletSettings, PopupOpenState, PopupResolution } from './types'

const singleton = Symbol('singleton')
const singletonEnforcer = Symbol('singletonEnforcer')

/** Function the popup/view promises resolve with once Siebel finishes loading. */
type PopupResolve = (value: PopupResolution) => void
type ViewResolve = (value: boolean) => void
type ViewReject = (reason?: unknown) => void

/**
 * Process-wide popup controller. Hooks Siebel's `ProcessNewPopup` and the `refreshpopup`/`refreshview`
 * events so MVG / pick / association popups can be opened, optionally hidden, and resolved as promises.
 * Accessed via {@link PopupController.instance}; direct construction is blocked by the Symbol enforcer.
 */
export default class PopupController {
  readonly consts: SiebelConstants
  /** Forwarded to `_createNexusInstance`; merged in by the `Applet` constructor (legacy `Nexus`). */
  settings?: Partial<BaseAppletSettings>

  isPopupHidden: boolean
  resolvePromise: PopupResolve | null
  popupApplet: NexusBridgeInstance | null // it could be removed in the next version
  assocApplet: NexusBridgeInstance | null // it could be removed in the next version

  viewLoadedResolve: ViewResolve | null
  viewLoadedReject: ViewReject | null
  targetViewName: string | null

  private static [singleton]?: PopupController

  static get instance(): PopupController {
    if (!PopupController[singleton]) {
      PopupController[singleton] = new PopupController(singletonEnforcer)
    }
    return PopupController[singleton]
  }

  /**
   * @internal Test affordance: drop the cached singleton so the next `instance` access reconstructs
   * against the current Siebel globals. Not part of the public API; do not use in production.
   */
  static resetInstanceForTesting(): void {
    delete PopupController[singleton]
  }

  constructor(enforcer?: symbol) {
    if (enforcer !== singletonEnforcer) {
      throw new Error('[NB] Instantiation failed: get popup controller instance instead of new')
    }

    this.consts = window.SiebelJS.Dependency('window.SiebelApp.Constants') as SiebelConstants
    this.isPopupHidden = false
    this.resolvePromise = null
    this.popupApplet = null // it could be removed in the next version
    this.assocApplet = null // it could be removed in the next version

    const popupPM = window.SiebelApp.S_App.GetPopupPM()
    // We have to check if PR was not created before to avoid double bindings.
    // Unloaded state check is not sufficient because standalone popups create
    // PR but the state remain unchanged (unloaded by default).
    if (
      popupPM.Get('state') === this.consts.get('POPUP_STATE_UNLOADED') &&
      !popupPM.GetRenderer()
    ) {
      popupPM.Setup() // this creates and initializes PR
    }

    log('[NB] Popup controller started')

    if (!window.SiebelAppFacade.NexusProcessNewPopup) {
      window.SiebelAppFacade.NexusProcessNewPopup = window.SiebelApp.S_App.ProcessNewPopup
      window.SiebelApp.S_App.ProcessNewPopup = (ps: SiebelPropertySet): unknown => {
        if (this.isPopupHidden) {
          this.isPopupHidden = false
          return this.processNewPopup(ps)
        }
        return window.SiebelAppFacade.NexusProcessNewPopup!.call(window.SiebelApp.S_App, ps)
      }
    }

    // resolve popup promise
    window.SiebelApp.EventManager.addListner('refreshpopup', this.onLoadPopupContent, this)
    // resolve/reject view promise
    window.SiebelApp.EventManager.addListner('refreshview', this.viewLoaded, this)

    this.viewLoadedResolve = null
    this.viewLoadedReject = null
    this.targetViewName = null

    window.SiebelAppFacade._NBPopupController = this // it could be removed in the next version
  }

  viewLoaded(): void {
    if (typeof this.viewLoadedResolve === 'function') {
      const viewName = window.SiebelApp.S_App.GetActiveView().GetName()
      const isCorrectViewName = viewName === this.targetViewName
      if (isCorrectViewName) {
        this.viewLoadedResolve(true)
      } else if (this.targetViewName && typeof this.viewLoadedReject === 'function') {
        this.viewLoadedReject(`The ${viewName} does not match target ${this.targetViewName} `)
      } else {
        // this is drilldown as this.targetViewName is not defined
        this.viewLoadedResolve(true)
      }
    }
    this.viewLoadedResolve = null
    this.viewLoadedReject = null
    this.targetViewName = null
  }

  // formerly it was called thru OnLoadPopupContent, now thru EventManager.refreshpopup
  onLoadPopupContent(): void {
    if (typeof this.resolvePromise !== 'function') {
      return
    }

    const { applet, assocApplet, appletName, assocAppletName } = PopupController.IsPopupOpen()

    if (!applet) {
      this.resolvePromise = null
      // TODO: better to reject Promise?
      throw new PopupError('[NB] Opened Popup Applet is not found in OnLoadPopupContent')
    }

    if (!window.SiebelAppFacade.NB) {
      warn(
        '[NB]The `window.SiebelAppFacade.NB` is empty. Please check if the PR files are deployed.'
      )
    } else {
      // ORW - keep or remove?
      Object.values(window.SiebelAppFacade.NB).forEach((nexus) => {
        if (nexus.isPopup) {
          if (assocApplet && nexus.isMvgAssoc) {
            this.assocApplet = nexus
          } else {
            this.popupApplet = nexus
          }
        }
      })
    }

    this.resolvePromise({
      appletName,
      applet,
      assocAppletName,
      assocApplet,
      nexusPopupApplet: this.popupApplet,
      nexusAssocApplet: this.assocApplet,
    })
    this.resolvePromise = null
  }

  gotoView(
    ctx: unknown,
    func: (viewName: string, appletName?: string, id?: string) => unknown,
    viewName: string,
    appletName?: string,
    id?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.viewLoadedResolve = resolve
      this.viewLoadedReject = reject
      this.targetViewName = viewName
      return func.call(ctx, viewName, appletName, id)
    })
  }

  _createNexusInstance(pm: SiebelPresentationModel): PopupApplet {
    return new PopupApplet(Object.assign({}, this.settings, { pm }) as BaseAppletSettings)
  }

  canOpenPopup(): boolean {
    return typeof this.resolvePromise !== 'function'
  }

  processNewPopup(ps: SiebelPropertySet): string {
    const popupPM = window.SiebelApp.S_App.GetPopupPM()

    // Clear the currPopups property in order to fill it with nested popup's applets
    popupPM.SetProperty('currPopups', [])

    // this property is added using AttachPMBinding into the Init PR (called by PM Setup)
    popupPM.AddProperty('state', this.consts.get('POPUP_STATE_VISIBLE'))

    let url = ps.GetProperty('URL')
    if (url.indexOf('start.swe') > -1) {
      // pre 17
      url = window.SiebelApp.S_App.GetPageURL() + url.split('start.swe')[1]
    } else {
      // assuming 17+
      url =
        window.SiebelApp.S_App.GetPageURL() +
        url.split(window.SiebelApp.S_App.GetAppExtension())[1]
    }
    popupPM.SetProperty('url', url)

    return 'refreshpopup'
  }

  closePopupApplet(nb?: NexusBridgeInstance | null): unknown {
    if (!nb || !nb.pm) {
      if (!this.popupApplet || !this.popupApplet.pm) {
        throw new PopupError(
          '[NB]The popup applet was not opened by NB and "nb" is not provided'
        )
      }
      nb = this.popupApplet
    }
    // TODO: should be be checked, ensure that CanInvokeMethod does not call server
    if (!nb.pm.ExecuteMethod('CanInvokeMethod', 'CloseApplet')) {
      throw new MethodNotSupportedError('[NB]The method CloseApplet is not allowed')
    }
    const ret = nb.pm.ExecuteMethod('InvokeMethod', 'CloseApplet')
    // it could be better if we don't have a Siebel Applet on the view
    // do reinit here on closing?
    this.popupApplet = null
    this.assocApplet = null
    return ret
  }

  static IsPopupOpen(): PopupOpenState {
    // safer to keep this method, even when we set some properties on resolve?
    const currPopups = window.SiebelApp.S_App.GetPopupPM().Get('currPopups') as SiebelApplet[]
    if (0 === currPopups.length) {
      return { isOpen: false }
    }
    if (1 === currPopups.length) {
      return {
        isOpen: true,
        applet: currPopups[0]!,
        appletName: currPopups[0]!.GetName(),
      }
    }
    if (2 === currPopups.length) {
      // is this always a shuttle when we have more one applet
      // OpenUI assumes that 0 is mvg, so do I
      return {
        isOpen: true,
        applet: currPopups[0]!,
        appletName: currPopups[0]!.GetName(),
        assocApplet: currPopups[1]!,
        assocAppletName: currPopups[1]!.GetName(),
      }
    }
    throw new ConnectError('[NB] Should never have been here')
  }

  checkOpenedPopup(closeIfOpen?: boolean): unknown {
    const { isOpen } = PopupController.IsPopupOpen()
    if (isOpen && closeIfOpen) {
      // this code will close the applet even if this applet was originated by another applet
      log('[NB] Closing already opened popup applet in checkOpenedPopup')
      // maybe do not close if the applet to be opened if the same as already opened?
      return this.closePopupApplet()
    }
    return isOpen
  }

  _openAssocApplet(
    hide: boolean,
    newRecordFunc: () => void,
    cb?: (value: PopupResolution) => unknown
  ): Promise<unknown> | boolean {
    this.isPopupHidden = !!hide

    newRecordFunc() // make async of invokeMethod?

    if (hide) {
      const ret = new Promise<PopupResolution>((resolve) => {
        this.resolvePromise = resolve
      })
      return typeof cb === 'function' ? ret.then(cb) : ret
    }

    return true
  }

  showExportApplet(
    hide: boolean,
    cb: ((value: PopupResolution) => unknown) | undefined,
    nb: NexusBridgeInstance
  ): Promise<unknown> | boolean {
    this.isPopupHidden = !!hide

    window.SiebelApp.CommandManager.GetInstance().InvokeCommand(
      `*Browser Applet* *ExportQuery*${nb.appletName}* *420*230*true`,
      true, //
      true // async
    )

    if (hide) {
      const ret = new Promise<PopupResolution>((resolve) => {
        this.resolvePromise = resolve
      })
      return typeof cb === 'function' ? ret.then(cb) : ret
    }

    return true
  }

  showPopupApplet(
    hide: boolean,
    cb: ((value: PopupResolution) => unknown) | undefined,
    nb: NexusBridgeInstance,
    methodName: string,
    ps?: SiebelPropertySet
  ): Promise<unknown> | unknown {
    // TODO: maybe use the properties set on promise resolving?
    this.isPopupHidden = !!hide

    // This is a quite common situation when invoked method fails due to some server or
    // validation errors, so popup won't even open in this case.
    const result = nb.pm.ExecuteMethod('InvokeMethod', methodName, ps)

    // can call EditField if EditPopup?

    if (hide) {
      if (false === result) {
        return Promise.reject()
      }

      // we will populate the instances only when applet should be hidden
      const ret = new Promise<PopupResolution>((resolve) => {
        this.resolvePromise = resolve
      })
      return typeof cb === 'function' ? ret.then(cb) : ret
    }

    return result
  }

  reInitPopupPM(): void {
    this.isPopupHidden = false

    const popupPM = window.SiebelApp.S_App.GetPopupPM()

    // First of first we have to delete all props/methods ever created by PM
    // and (that's important!) all bindings attached to them by PR.
    popupPM.EndLife()
    // Props/methods of particular PM are stored inside of BasePM in private
    // variables shared between many PMs. As PM.EndLife just deletes specific
    // key in these variables we have to call PM.constructor to reinitialize
    // these variables with empty prop/method sets for current PM.
    // `constructor` is typed as `Function`; cast to call it with the proxy arg, as the legacy did.
    ;(popupPM.constructor as (arg: { GetName: () => string }) => void)({ GetName: () => 'PopupPxy' })
    // Now we can safely allow PM to recreate own props and methods.
    popupPM.Init()
    // Create PR (here new bindings attached to just added PM props/methods)
    popupPM.Setup()

    // This tweak clears all visible/hidden remains inside DOM container that
    // were created by previous PR, and eliminates weird glitches in popups
    // opened by fresh PR first time.
    // Also it "hides" standard (unhidden) popup if it was opened and active
    // just before reInitPopupPM call. It's useful if this popup itself
    // caused navigation to another view.
    popupPM.SetProperty('state', this.consts.get('POPUP_STATE_HIDDEN'))

    // As all PM's method bindings previously were removed we have to read
    // our handler for OnLoadPopupContent method again.
    // popupPM.AddMethod('OnLoadPopupContent', this.onLoadPopupContent, {
    //  sequence: false,
    //  scope: this
    // })
    // above commented when started to use refreshpopup
  }
}
