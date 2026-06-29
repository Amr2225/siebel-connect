// Applet.ts — the factory's main applet class `Applet<TRecord>` (was `Nexus`).
//
// Phase 08 port, translated call-for-call from `_legacy/nexus-bridge/src/index.js` (the `Nexus`
// class). Per the corrected hierarchy it `extends BaseApplet` and is a **sibling** of `PopupApplet`.
// It owns the `PopupController` singleton, merging its settings into it, and adds popup orchestration
// (`showMvgApplet`/`showPickApplet`/`showPopup`/`showExportApplet`/`changeRecords`/`openAssocApplet`),
// navigation (`drilldown(Promised)`, `gotoView(Promised)`), user preferences, and the statics
// (`GotoView`/`GotoViewPromised`/`ReInitPopup`/`CreatePopupNB`).
//
// Behaviour is unchanged. Only the plan-sanctioned moves apply:
//   1. Types + generics. `TRecord` flows in from `BaseApplet`; the controller hand-offs are typed.
//   2. String throws → typed `ConnectError` subclasses, with the *exact* original message text:
//      `PopupError` for the "cannot open popup" guards, `QueryModeError` for the MVG query-mode guard,
//      `MethodNotSupportedError` for the unavailable `NewRecord`, `ControlNotFoundError` for the
//      missing-control guards, and base `ConnectError` for the control UI-type guards (per the spec).
//   3. Diagnostics route through the debug-gated `./logger` (none are emitted here today).
//
// Identifiers drop the `Nexus` prefix (Naming map); runtime method-name strings (`'EditPopup'`,
// `'ChangeRecords'`, `'ShowPopup'`, the `GotoView` SWE-command, the `[NB]` prefixes) are kept verbatim.

import BaseApplet from './BaseApplet'
import PopupController from './PopupController'
import PopupApplet from './PopupApplet'
import {
  ConnectError,
  ControlNotFoundError,
  MethodNotSupportedError,
  PopupError,
  QueryModeError,
} from './errors'
import type { BaseAppletSettings, PopupResolution, SiebelRecord } from './types'

/** Callback the popup-opening methods resolve with once Siebel finishes loading the popup. */
type PopupCallback = (value: PopupResolution) => unknown

/**
 * Main applet wrapping a Siebel Presentation Model. Extends {@link BaseApplet} with popup
 * orchestration, view navigation, drilldown, and user preferences; `TRecord` is the applet BC's
 * record shape. Sibling of {@link PopupApplet}. Normally built for you by the factory (Phase 9).
 */
export default class Applet<TRecord extends SiebelRecord = SiebelRecord> extends BaseApplet<TRecord> {
  readonly popupController: PopupController

  constructor(settings: BaseAppletSettings) {
    super(settings)

    // get the PopupController singleton instance
    this.popupController = PopupController.instance
    this.popupController.settings = Object.assign(this.popupController.settings || {}, settings)
  }

  saveUserPref(key: string, value: unknown): void {
    const ps = window.SiebelApp.S_App.NewPropertySet()
    ps.SetProperty('Key', key)
    ps.SetProperty(key, value)
    this.pm.SetProperty(key, value)
    this.pm.OnControlEvent(
      this.consts.get('PHYEVENT_INVOKE_CONTROL'),
      this.pm.Get(this.consts.get('SWE_MTHD_UPDATE_USER_PREF')),
      ps
    )
  }

  getUserPref(key: string): unknown {
    return this.pm.Get(key)
  }

  closePopupApplet(nb?: BaseApplet | null): unknown {
    return this.popupController.closePopupApplet(nb)
  }

  showPopupApplet(
    method: string,
    hide: boolean,
    cb?: PopupCallback,
    ps?: SiebelPropertySet
  ): unknown {
    if (!this.popupController.canOpenPopup()) {
      throw new PopupError(
        '[NB] Cannot open popup, another popup is openning and exists resolve func'
      )
    }
    return this.popupController.showPopupApplet(hide, cb, this, method, ps)
  }

  _showEditPopup(controlName: string, hide: boolean, cb?: PopupCallback): unknown {
    this._setActiveControl(controlName)
    return this.showPopupApplet('EditPopup', hide, cb)
  }

  changeRecords(hide: boolean, cb?: PopupCallback): void {
    this.showPopupApplet('ChangeRecords', hide, cb)
  }

  showExportApplet(hide: boolean, cb?: PopupCallback): unknown {
    if (!this.popupController.canOpenPopup()) {
      throw new PopupError(
        '[NB] Cannot open popup, another popup is openning and exists resolve func'
      )
    }
    return this.popupController.showExportApplet(hide, cb, this)
    // return this.showPopupApplet('ExportQuery', hide, cb)
  }

  showMvgApplet(name: string, hide: boolean, cb?: PopupCallback): unknown {
    const control = this._getControl(name)
    if (!control) {
      throw new ControlNotFoundError(
        `[NB] Cannot find a control by name ${name} to show Mvg applet.`,
        { appletName: this.appletName, controlName: name }
      )
    }
    const uiType = control.GetUIType()
    if (uiType !== this.consts.get('SWE_CTRL_MVG')) {
      throw new ConnectError(
        `Control ${name} is not of supported type ${uiType} to show Mvg applet`,
        { appletName: this.appletName, controlName: name }
      )
    }
    if (this.pm.Get('IsInQueryMode')) {
      throw new QueryModeError('[NB] Mvg applet cannot be opened in query mode', {
        appletName: this.appletName,
      })
    }
    return this._showEditPopup(name, hide, cb)
  }

  showPickApplet(name: string, hide: boolean, cb?: PopupCallback): unknown {
    const control = this._getControl(name)
    if (!control) {
      throw new ControlNotFoundError(
        `[NB] Cannot find a control by name ${name} to show Pick applet.`,
        { appletName: this.appletName, controlName: name }
      )
    }
    const uiType = control.GetUIType()
    if (uiType !== this.consts.get('SWE_CTRL_PICK')) {
      throw new ConnectError(
        `Control ${name} is not of supported type ${uiType} to show Pick applet`,
        { appletName: this.appletName, controlName: name }
      )
    }
    return this._showEditPopup(name, hide, cb)
  }

  showPopup(name: string, hide: boolean, cb?: PopupCallback): unknown {
    const control = this._getControl(name)
    if (!control) {
      throw new ControlNotFoundError(
        `[NB] Cannot find a control by name ${name} to show Popup applet.`,
        { appletName: this.appletName, controlName: name }
      )
    }
    const uiType = control.GetUIType()
    if (uiType !== 'Button') {
      throw new ConnectError(
        `Control ${name} is not of supported type ${uiType} to show Popup applet`,
        { appletName: this.appletName, controlName: name }
      )
    }
    if (control.GetMethodName() !== 'ShowPopup') {
      throw new ConnectError(`Control ${name} method is not ShowPopup`, {
        appletName: this.appletName,
        controlName: name,
      })
    }
    const ps = control.GetMethodPropSet() // TODO: check if the SWETA property exists?

    this._setActiveControl(name)

    return this.showPopupApplet('ShowPopup', hide, cb, ps)
  }

  _newAssocRecord(): Promise<unknown> {
    return new Promise((resolve) =>
      this.pm.ExecuteMethod('InvokeMethod', 'NewRecord', null, {
        async: true,
        cb: resolve,
      })
    )
  }

  openAssocApplet(hide: boolean, cb?: PopupCallback): Promise<unknown> | boolean {
    // this method should be available for child business component in M:M relationship
    if (!this.popupController.canOpenPopup()) {
      throw new PopupError('[NB] Cannot open popup (currently exists resolve function)')
    }
    if (!this.canInvokeMethod('NewRecord')) {
      throw new MethodNotSupportedError('[NB] NewRecord is not available', {
        appletName: this.appletName,
        method: 'NewRecord',
      }) // also when in query mode
    }
    return this.popupController._openAssocApplet(hide, this._newAssocRecord.bind(this), cb)
  }

  drilldown(controlName: string): unknown {
    if (this.isListApplet) {
      // TODO: check isLink of control?
      // index is not effective, and drilldown anyway happens on the selected record
      const index = this.getSelection()

      // return this.pm.ExecuteMethod('OnDrillDown', controlName, index);
      return this.pm.OnControlEvent(
        this.consts.get('PHYEVENT_DRILLDOWN_LIST'),
        controlName,
        index
      )
    }
    // else lets assume it is form applet
    const control = this._getControl(controlName)
    if (!control) {
      throw new ControlNotFoundError(`[NB] Control ${controlName} is not found`, {
        appletName: this.appletName,
        controlName,
      })
    }
    return this.pm.OnControlEvent(this.consts.get('PHYEVENT_DRILLDOWN_FORM'), control)
    // const ps = control.GetMethodPropSet();
    // return this.pm.ExecuteMethod('InvokeMethod', 'DrillDown', ps);
  }

  drilldownPromised(controlName: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.popupController.viewLoadedResolve = resolve
      this.drilldown(controlName)
    })
  }

  static GotoView(viewName: string, appletName?: string, id?: string): unknown {
    if (appletName && id) {
      let SWECmd = `GotoView&SWEView=${viewName}&SWEApplet0=${appletName}`
      SWECmd += `&SWEBU=1&SWEKeepContext=FALSE&SWERowId0=${id}`
      SWECmd = encodeURI(SWECmd)
      return window.SiebelApp.S_App.GotoView(viewName, '', SWECmd, '')
    } else {
      return window.SiebelApp.S_App.GotoView(viewName)
    }
  }

  gotoView(viewName: string, appletName?: string, id?: string): unknown {
    // id = typeof id === 'undefined' ? (this.getCurrentRecord(true) || {}).Id : id
    return Applet.GotoView(viewName, appletName, id)
  }

  gotoViewPromised(targetViewName: string, appletName?: string, id?: string): Promise<boolean> {
    return this.popupController.gotoView(
      this,
      this.gotoView,
      targetViewName,
      appletName,
      id
    )
  }

  static GotoViewPromised(
    targetViewName: string,
    appletName?: string,
    id?: string
  ): Promise<boolean> {
    return PopupController.instance.gotoView(
      null,
      Applet.GotoView,
      targetViewName,
      appletName,
      id
    )
  }

  reInitPopup(): void {
    this.popupController.reInitPopupPM()
  }

  static ReInitPopup(): void {
    PopupController.instance.reInitPopupPM()
  }

  static CreatePopupNB(settings: BaseAppletSettings): PopupApplet {
    if (!settings.pm || !settings.pm.Get('IsPopup')) {
      throw new PopupError('[NB] No pm or the given pm is not popup applet PM')
    }

    const popupPM = window.SiebelApp.S_App.GetPopupPM()
    const isShuttle = popupPM.Get('isPopupMVGAssoc')
    const mvgAssoc = popupPM.Get('MVGAssocAppletObject') as SiebelApplet | undefined

    settings.isMvgAssoc = !!(
      isShuttle &&
      mvgAssoc &&
      settings.pm.Get('GetName') === mvgAssoc.GetName()
    )
    settings.isPopup = true
    return new PopupApplet(settings)
  }
}
