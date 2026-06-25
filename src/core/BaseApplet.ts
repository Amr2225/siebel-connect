// BaseApplet.ts — generic base applet `BaseApplet<TRecord>` (was `NexusBaseApplet`).
//
// Phase 06 port. This is the heart of the bridge, translated call-for-call from
// `_legacy/nexus-bridge/src/NexusBaseApplet.js`. Every Siebel PM call, guard branch, and battle-tested
// comment (the date/number/currency conversion in `_getSiebelValue`/`_getJSValue`, the `positionOnRow`
// guards) is preserved verbatim. Only three things change, each plan-sanctioned:
//
//   1. Types + generics. `TRecord` threads through the record accessors so
//      `getApplet('x').getCurrentRecord()` is `RecordOf<'x'> | undefined`, not `any`.
//   2. String throws → typed `ConnectError` subclasses, with the *exact* original message text
//      preserved (see ./errors). Catch sites can now discriminate by class.
//   3. Diagnostics → the pluggable, debug-gated `./logger` (plan req #7, Phase 05 precedent), replacing
//      the legacy unconditional `console.log/warn/error`. Throwing is unaffected.
//
// Identifiers drop the `Nexus` prefix (Naming map); runtime *method-name* strings (`'CreateRecord'`,
// `'ExecuteQuery'`, the `[NB]` prefixes) are kept verbatim to preserve the behavioural surface.

import Notifications, { type NotificationsOptions } from './Notifications'
import LocaleData from './LocaleData'
import { log, warn, error as logError } from './logger'
import {
  ConnectError,
  PositionError,
  QueryModeError,
  ReadonlyControlError,
  ControlNotFoundError,
} from './errors'
import type {
  SiebelRecord,
  BaseAppletSettings,
  ControlModel,
  ControlState,
  CurrentRecordState,
  FieldControlInfo,
  MvfResult,
  PaginationInfo,
  PopupType,
  RecordModel,
  SubscriptionToken,
} from './types'

/** Optional `{ async, cb }` bag accepted by the navigation/CRUD wrappers (legacy `invokeMethod`). */
interface InvokeOptions {
  async?: boolean
  cb?: (...args: unknown[]) => unknown
}

/**
 * Generic base applet wrapping a Siebel Presentation Model. `TRecord` is the record shape this applet's
 * Business Component yields; it flows through `getRecordSet`, `getCurrentRecord`,
 * `getControlsRecordSet`, etc. Subclassed by `Applet` and `PopupApplet` (siblings).
 */
export default class BaseApplet<TRecord extends SiebelRecord = SiebelRecord> {
  readonly consts: SiebelConstants
  readonly pm: SiebelPresentationModel
  readonly convertDates: boolean | undefined
  readonly returnRawNumbers: boolean | undefined
  readonly returnRawIntegers: boolean | undefined
  readonly returnRawCurrencies: boolean | undefined
  readonly isMvgAssoc: boolean | undefined
  readonly isPopup: boolean | undefined

  readonly view: SiebelView
  readonly appletName: string
  readonly isListApplet: boolean
  readonly required: string[] = []
  readonly lov: Record<string, unknown> = {}
  readonly boolObject: SiebelBoolObject
  readonly localeData: LocaleData
  readonly fieldToControlMap: Record<string, FieldControlInfo>
  readonly notifications: Notifications
  readonly isTreeApplet: boolean

  /** Stash for `window.SiebelApp.Utils.Confirm` while `deleteRecordSync` suppresses the dialog. */
  private NexusConfirm?: (...args: unknown[]) => boolean

  constructor(settings: BaseAppletSettings) {
    this.consts = window.SiebelJS.Dependency('window.SiebelApp.Constants') as SiebelConstants

    this.pm = settings.pm
    this.convertDates = settings.convertDates
    this.returnRawNumbers = settings.returnRawNumbers
    this.returnRawIntegers = settings.returnRawIntegers
    this.returnRawCurrencies = settings.returnRawCurrencies
    this.isMvgAssoc = settings.isMvgAssoc
    this.isPopup = settings.isPopup

    if (!this.pm) {
      throw new ConnectError('[NB] Nexus initialisation failed. Please provide the `pm`')
    }

    this.view = window.SiebelApp.S_App.GetActiveView()
    this.appletName = this.pm.Get('GetName') as string
    this.isListApplet = typeof this.pm.Get('GetListOfColumns') !== 'undefined'
    this.required = []
    this.lov = {}
    this.boolObject = new window.SiebelApp.S_App.DatumBoolObject()

    this.localeData = LocaleData.instance // get the instance of locale data object

    this.fieldToControlMap = this._getFieldToControlMap()
    // `debug` assigned only when present so `exactOptionalPropertyTypes` keeps it absent (not `undefined`).
    const notifOptions: NotificationsOptions = {
      pm: this.pm,
      consts: this.consts,
      fieldToControlMap: this.fieldToControlMap,
    }
    if (settings.debug !== undefined) notifOptions.debug = settings.debug
    this.notifications = new Notifications(notifOptions)

    // populate the required array
    if (this.isListApplet) {
      const columns = this.pm.Get('ListOfColumns') as Record<
        string,
        { isRequired: boolean; control: SiebelControl }
      >

      Object.values(columns).forEach((column) => {
        if (column.isRequired) {
          this.required.push(column.control.GetInputName())
        }
      })
    } else {
      const appletId = `s_${this.pm.Get('GetFullId')}_div`
      const applet = document.getElementById(appletId)
      if (applet) {
        const appletInputs = applet.querySelectorAll('input')
        appletInputs.forEach((el) => {
          if (el.attributes.getNamedItem('aria-required')) {
            // `getNamedItem('name')!.nodeValue!` reproduces the legacy `el.attributes.name.nodeValue`
            // (which likewise throws if the name attribute is absent).
            this.required.push(el.attributes.getNamedItem('name')!.nodeValue!)
          }
        })
      } else {
        warn(
          `[NB] Cannot get required controls from HTML. HTML was already removed?/${this.appletName}`
        )
      }
    }

    // listener to get dynamic LOVs
    this.pm.AttachPMBinding(
      'UpdateQuickPickInfo',
      (...args: unknown[]) => {
        const inputName = args[0] as string
        const arr = args[2] as string[]
        const i = args[3] as number
        const activeControl = this.pm.Get('GetActiveControl') as SiebelControl | null
        if (i === 6) {
          // this is a normal flow, could it be 5 as in Bookshelf stated?
          if (this.appletName === arr[2]) {
            if ('false' === arr[4]) {
              warn(
                `[NB] Picklist is not associated with the control ${inputName} - ${JSON.stringify(arr)}`
              )
            }
            this.lov[inputName] = arr.slice().splice(i)
            // if current input is active then fill JQuery autocomplete with lov values for vanilla dropdown
            if (inputName === activeControl?.GetInputName()) {
              this.pm
                .GetRenderer()
                ?.GetUIWrapper(activeControl as SiebelControl)
                ?.UpdatePickList(this.lov[inputName])
            }
          }
        } else if (i === 0) {
          // this is a misconfiguration, when getting dynamic LOV is called second+ time?
          warn(
            `[NB] It seems the control/list column ${inputName} is incorrectly configured in the Tools.`
          )
          this.lov[inputName] = arr
          // if current input is active then fill JQuery autocomplete with lov values for vanilla dropdown
          if (inputName === activeControl?.GetInputName()) {
            this.pm
              .GetRenderer()
              ?.GetUIWrapper(activeControl as SiebelControl)
              ?.UpdatePickList(this.lov[inputName])
          }
        }
      },
      { scope: this }
    )

    this.isTreeApplet =
      window.SiebelAppFacade.ExplorerPresentationModel === this.pm.constructor
    if (this.isTreeApplet) {
      warn(
        `[NB] This is a tree applet ${this.appletName}. Please use list or form applets instead.`
      )
    }
  }

  subscribe(func: () => void): SubscriptionToken {
    // TODO: accept also context for function, or the caller binds the context to the function?
    return this.notifications.subscribe(func)
  }

  unsubscribe(token: SubscriptionToken): number {
    return this.notifications.unsubscribe(token)
  }

  invokeSubscriptions(): void {
    this.notifications._invokeSubscriptions()
  }

  _getControl(name: string): SiebelControl | undefined {
    // TODO: check if control found?
    return this.pm.ExecuteMethod('GetControl', name) as SiebelControl | undefined
  }

  _returnControls(): Record<string, SiebelControl> {
    // if (this.isListApplet) { // commented to return buttons for list applet
    //  return this.pm.Get('GetListOfColumns');
    // }
    return this.pm.Get('GetControls') as Record<string, SiebelControl>
  }

  // called into the getControls to reduce the amount of the returned controls
  _isSkipControl(type: string): boolean {
    // https://docs.oracle.com/cd/E74890_01/books/ConfigOpenUI/appendix_a_api002.htm
    // maybe we need to exclude more types
    return (
      // type === this.consts.get('SWE_CTRL_LINK') ||
      // || (type === this.consts.get('SWE_PST_BUTTON_CTRL'))
      // || (type === this.consts.get('SWE_CTRL_PLAINTEXT')) // KC IM
      type === 'null'
    ) // GetUiType returns string
  }

  _isRequired(inputName: string): boolean {
    // it would be very good to use IsRequired method and RequiredControl PM prop, but it always []
    return this.required.indexOf(inputName) > -1
  }

  _setActiveControl(name: string | null): unknown {
    if (name) {
      return this.pm.ExecuteMethod('SetActiveControl', this._getControl(name))
    }
    return this.pm.ExecuteMethod('SetActiveControl', null)
  }

  _isDateTimeControl(uiType: string): boolean {
    return (
      this.consts.get('SWE_CTRL_DATE_TZ_PICK') === uiType ||
      this.consts.get('SWE_CTRL_DATE_TIME_PICK') === uiType ||
      this.consts.get('SWE_CTRL_DATE_PICK') === uiType
    )
  }

  _getSiebelValue(value: unknown, uiType: string, displayFormat?: string): string {
    if (this.consts.get('SWE_CTRL_CHECKBOX') === uiType) {
      // convert true/false => Y/N
      // null converted to N (the same as in standard Open UI)
      // check typeof value === 'boolean' || value === null ?
      this.boolObject.SetValue(value)
      return this.boolObject.GetAsString()
    }
    // MK suggested fix to allow setting the empty date (check if value)
    if (this.convertDates && displayFormat && value && this._isDateTimeControl(uiType)) {
      if (!(value instanceof Date)) {
        throw new ConnectError(
          `[NB] When NB was created with convertDates settings, value is expected to be a date - ${value}`
        )
      }
      const date = value
        .toLocaleString('en-US', { hourCycle: 'h23' })
        .split(',')
        .join('')
        .replace(/\s+/g, ' ') // AK fix for Edge
        .replace(/[^ -~]/g, '') // MK fix for IE11
      return window.SiebelApp.S_App.LocaleObject.GetStringFromDateTime(
        date,
        'M/D/YYYY HH:mm:ss',
        displayFormat,
        false // if true, / and : is NOT changed to local date and time separator
      )
    }
    return String(value) // to implicitly convert to string, Number for currencies/numbers (was `${value}`)
  }

  canInvokeMethod(method: string): boolean {
    // TODO: could be dangerous, check GetCanInvokeByName first?
    return this.pm.ExecuteMethod('CanInvokeMethod', method) as boolean
  }

  invokeMethod(method: string, { async, cb }: InvokeOptions = {}): boolean | Promise<unknown> | unknown {
    // TODO: check if the method in the local array? or maybe skip checking for canInvokeMethod
    if (!this.canInvokeMethod(method)) {
      return false
    }
    if (async) {
      const promise = new Promise<unknown[]>((resolve) =>
        this.pm.ExecuteMethod('InvokeMethod', method, null, {
          async,
          cb: function () {
            // eslint-disable-next-line prefer-rest-params -- verbatim: forwards Siebel's cb arguments
            resolve.call(null, [].slice.call(arguments))
          },
        })
      )
      return typeof cb === 'function' ? promise.then(cb) : promise
    }
    return this.pm.ExecuteMethod('InvokeMethod', method)
  }

  _getCurrencyCodeField(control: SiebelControl): string {
    const fieldNumber = control.GetCurrField()
    if (!fieldNumber) {
      throw new ConnectError(`[NB] Not found currency field for ${control.GetFieldName()}`)
    }
    // check if 0 exists?
    return window.SiebelApp.S_App.LookupStringCache(fieldNumber).split('|')[0]!
  }

  static GetPropSet(control: SiebelControl): { prop: string; val: unknown }[] {
    const ret: { prop: string; val: unknown }[] = []
    const propSet = control.GetPMPropSet()
    if (propSet && propSet.propArray) {
      const { propArray } = propSet
      Object.keys(propArray).forEach((prop) => ret.push({ prop, val: propArray[prop] }))
    }
    return ret
  }

  static GetControlStaticLOV(control: SiebelControl): string[] {
    return control
      .GetRadioGroupPropSet()
      .childArray.map((el) => el.propArray.DisplayName!)
  }

  _getIconMap(control: SiebelControl): unknown {
    const iconMap = control.GetIconMap()
    if (iconMap) {
      return window.SiebelApp.S_App.GetIconMap()[
        window.SiebelApp.S_App.LookupStringCache(iconMap as string)
      ]
    }
    return null
  }

  _getControls(controls: [string, SiebelControl][]): Record<string, ControlModel> {
    const ret: Record<string, ControlModel> = {}
    const list = this.pm.Get('GetListOfColumns') as Record<string, unknown> | undefined
    controls.forEach((controlEntry) => {
      const control = controlEntry[1]
      const uiType = control.GetUIType()
      if (!this._isSkipControl(uiType)) {
        const name = controlEntry[0]
        const inputName = control.GetInputName()
        const fieldName = control.GetFieldName()
        const displayFormat = control.GetDisplayFormat() || this.getControlDisplayFormat(uiType)
        const staticPick = control.IsStaticBounded() === '1'
        const dataType = this.pm.ExecuteMethod('GetFieldDataType', fieldName) as string
        const obj: ControlModel = {
          name,
          label: control.GetDisplayName(),
          uiType,
          required: this._isRequired(inputName),
          boundedPick: control.IsBoundedPick() === '1',
          staticPick,
          inputName,
          isPostChanges: control.IsPostChanges(),
          maxSize: control.GetMaxSize(),
          fieldName,
          isLink: this.pm.ExecuteMethod('CanNavigate', name) as boolean,
          readonly: !this.pm.ExecuteMethod('CanUpdate', name),
          displayFormat,
          dataType,
          isLOV: staticPick || this.consts.get('SWE_CTRL_COMBOBOX') === uiType,
          currencyCodeField: 'currency' === dataType ? this._getCurrencyCodeField(control) : '',
          popupType: control.GetPopupType(), // always correlate to uiType?
          props: BaseApplet.GetPropSet(control),
          isSortable: control.IsSortable(),
          iconMap: this._getIconMap(control),
          methodName: control.GetMethodName(),
          isListColumn: !!(this.isListApplet && list && list[name]),
        }
        if (obj.staticPick) {
          obj.options = BaseApplet.GetControlStaticLOV(control)
        }
        ret[name] = obj
      }
    })
    // Synthesized fallback `Id` is intentionally minimal (verbatim from legacy); cast past ControlModel.
    ret.Id =
      ret.Id ||
      ({
        name: 'Id',
        label: 'Id',
        uiType: this.consts.get('SWE_CTRL_TEXT'),
        dataType: 'id',
      } as ControlModel)
    return ret
  }

  getListColumns(): Record<string, ControlModel> {
    if (!this.isListApplet) {
      throw new ConnectError('[NB] getListColumns works only for list applet', {
        appletName: this.appletName,
      })
    }
    const appletControls = this.pm.Get('GetListOfColumns') as Record<string, SiebelControl>
    return this._getControls(Object.entries(appletControls))
  }

  getControls(): Record<string, ControlModel> {
    const appletControls = this._returnControls()
    return this._getControls(Object.entries(appletControls))
  }

  getRecordSet(addRecordIndex?: boolean): TRecord[] {
    // TODO: convert the values?

    const rawRecordSet = this.getRawRecordSet() // just fallback if record set does not have Id

    // Worked on a widened record so `_indx`/`Id` can be written (a generic `TRecord` is read-only-indexed).
    const recordSet = (this.pm.Get('GetRecordSet') as TRecord[]).map((el, index) => {
      const ret: Record<string, unknown> = { ...el } // clone
      if (addRecordIndex) {
        ret._indx = index
      }
      // when in query mode, recordSet has 1 record, and rawRecordSet has 0 records.
      if (!this.pm.Get('IsInQueryMode')) {
        // not adding Id in Query Mode
        ret.Id = ret.Id || rawRecordSet[index]!.Id // add Id if missing
      }
      return ret
    })

    // assumes it is form applet for which GetRecordSet returns not formatted values,
    // so we need to get the formatted values
    if (!this.isListApplet && !this.pm.Get('IsInQueryMode')) {
      const controls = this._returnControls()
      recordSet.forEach((record, index) => {
        const fields = Object.keys(record)
        fields.forEach((field) => {
          if (this.fieldToControlMap[field]) {
            const controlName = this.fieldToControlMap[field].name
            const control = controls[controlName]
            const value = this.pm.ExecuteMethod('GetFormattedFieldValue', control)
            recordSet[index]![field] = value
          }
        })
      })
    }
    return recordSet as unknown as TRecord[]
  }

  getRawRecordSet(addRecordIndex?: boolean): TRecord[] {
    // TODO: convert the values?
    return (this.pm.Get('GetRawRecordSet') as TRecord[]).map((el, index) => {
      const ret: Record<string, unknown> = { ...el }
      if (addRecordIndex) {
        ret._indx = index
      }
      return ret as unknown as TRecord
    })
  }

  getRowListRowCount(): number {
    // how much applet can display (specified in Siebel Tools) - 10/20
    return this.pm.Get('GetRowListRowCount') as number
  }

  getNumRows(): number {
    // currently fetched from server?
    return this.pm.Get('GetNumRows') as number
  }

  getSelection(): number {
    return this.pm.Get('GetSelection') as number
  }

  nextRecord(options: InvokeOptions = {}): boolean | Promise<unknown> | unknown {
    return this.invokeMethod(this.isListApplet ? 'GotoNext' : 'GotoNextSet', options)
  }

  nextRecordSet(options: InvokeOptions = {}): boolean | Promise<unknown> | unknown {
    if (!this.isListApplet) {
      return false
    }
    return this.invokeMethod('GotoNextSet', options)
  }

  positionOnRow(
    index: number,
    keys?: { ctrlKey?: boolean; shiftKey?: boolean },
    skipIfAlreadyPositioned?: boolean
  ): unknown {
    // TODO: check IsInQueryMode?, as it still could be invoked in query mode (and even works)
    if (!this.isListApplet) {
      throw new PositionError('[NB] Method PositionOnRow is allowed only for list applets', {
        appletName: this.appletName,
      })
    }
    // if (!this.pm.ExecuteMethod('CanInvokeMethod', 'PositionOnRow')) { // TODO: check if can invoke already known?
    //   throw new Error('[NB] Method PositionOnRow can not be invoked now.')
    // }
    if (!Number.isInteger(+index)) {
      throw new PositionError(
        `[NB] The index for positionOnRow should be integer number, given value - ${index}`
      )
    }
    if (Number(index) < 0) {
      throw new PositionError(`[NB] Incorrect index given for positionOnRow - ${index}`)
    }
    if (this.getRowListRowCount() < Number(index) + 1) {
      throw new PositionError(
        `[NB] ${index} is equal/higher than allowed amount of records - ${this.getRowListRowCount()}.`
      )
    }
    if (this.getNumRows() < Number(index) + 1) {
      throw new PositionError(
        `[NB] ${index} is equal/higher than displayed amount of records - ${this.getNumRows()}.`
      )
    }
    if (skipIfAlreadyPositioned) {
      // check if already on the same row
      if (Number(index) === this.getSelection()) {
        return true // do not call the server
      }
    }

    // nullify the active picklist control as the active picklist prevents positioning
    const control = this.pm.Get('GetActiveControl')
    if (control) {
      // control is a picklist
      // it was found that in some environments any active control prevents positionOnRow
      // if (this.consts.get('SWE_CTRL_COMBOBOX') === control.GetUIType()) {
      this.pm.ExecuteMethod('SetActiveControl', null)
      // }
    }

    const { ctrlKey, shiftKey } = keys || {}
    const ret = this.pm.ExecuteMethod('HandleRowSelect', index, ctrlKey, shiftKey)

    // TODO: remove it? instead of it, the ext app have to check `ret`
    if (+index !== this.getSelection()) {
      throw new PositionError(`positioning not happened - ${index}/${this.getSelection()}`)
    }
    return ret // true if success, false is positioning not happened
  }

  prevRecord(options: InvokeOptions = {}): boolean | Promise<unknown> | unknown {
    if (this.isListApplet) {
      // return this.positionOnRow(this.pm.Get('GetSelection') - 1)
      return this.invokeMethod('GotoPrevious', options)
    }
    return this.invokeMethod('GotoPreviousSet', options)
  }

  prevRecordSet(options: InvokeOptions = {}): boolean | Promise<unknown> | unknown {
    if (!this.isListApplet) {
      return false
    }
    return this.invokeMethod('GotoPreviousSet', options)
  }

  newRecord(cb?: (value: unknown) => unknown): Promise<unknown> {
    const promise = new Promise((resolve) => this._newRecord(resolve))
    return typeof cb === 'function' ? promise.then(cb) : promise
  }

  _newRecord(cb: (...args: unknown[]) => unknown): unknown {
    // 20190312 - changed from NewRecord to CreateRecord, #31
    return this.pm.ExecuteMethod('InvokeMethod', 'CreateRecord', null, {
      async: true,
      cb,
    })
  }

  newRecordSync(): unknown {
    // 20190312 - changed from NewRecord to CreateRecord, #
    // if there is some configuration (e.g. server script) that works for NewRecord, it will not be invoked
    // workaround call the NewRecord explicitly
    return this.pm.ExecuteMethod('InvokeMethod', 'CreateRecord')
  }

  writeRecord(cb?: () => unknown, cberr?: () => unknown): Promise<unknown> {
    let promise: Promise<unknown> = new Promise<void>((resolve, reject) =>
      this._writeRecord((...args: unknown[]) => {
        if ((args[2] as SiebelPropertySet).GetProperty('Status') === 'Completed') {
          resolve()
        } else {
          reject()
        }
      })
    )
    promise = typeof cb === 'function' ? promise.then(cb) : promise
    promise = typeof cberr === 'function' ? promise.catch(cberr) : promise
    return promise
  }

  _writeRecord(cb: (...args: unknown[]) => unknown): unknown {
    return this.pm.ExecuteMethod('InvokeMethod', 'WriteRecord', null, {
      async: true,
      // selfbusy: true,
      cb,
    })
  }

  writeRecordSync(): unknown {
    return this.pm.ExecuteMethod('InvokeMethod', 'WriteRecord')
  }

  deleteRecordSync(skipConfirmDialog?: boolean): unknown {
    if (skipConfirmDialog) {
      this.NexusConfirm = window.SiebelApp.Utils.Confirm
      window.SiebelApp.Utils.Confirm = () => true
    }
    // do we need to try..catch and restore the function in catch ?
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'DeleteRecord')
    if (skipConfirmDialog) {
      window.SiebelApp.Utils.Confirm = this.NexusConfirm as (...args: unknown[]) => boolean
    }
    return ret
  }

  undoRecordSync(): unknown {
    return this.pm.ExecuteMethod('InvokeMethod', 'UndoRecord')
  }

  setControlValue(name: string, value: unknown): unknown {
    // TODO: If value is null, nothing happens, should we convert null to ''?
    const control = this._getControl(name)
    if (!control) {
      throw new ControlNotFoundError(`[NB] Cannot find a control by name ${name} to set ${value}.`, {
        appletName: this.appletName,
        controlName: name,
      })
    }

    // check if reaonly
    if (!this.pm.ExecuteMethod('CanUpdate', name)) {
      throw new ReadonlyControlError(`[NB] The control ${name} is read-only.`, {
        appletName: this.appletName,
        controlName: name,
      })
    }

    const uiType = control.GetUIType()
    const displayFormat = control.GetDisplayFormat() || this.getControlDisplayFormat(uiType)
    value = this._getSiebelValue(value, uiType, displayFormat)
    // TODO: should we use SetCellValue for list applets?
    const ret = this._setControlValueInternal(control, value)
    if (!ret) {
      // actually the observed behavior that the return is always true
      log(`[NB] Value ${value} was not set for ${name} control`)
    }
    return ret
  }

  // experimental method, not needed when API is used?
  // could be removed in the next version
  _setControlValue(name: string, value: unknown): unknown {
    let ret: unknown = this.setControlValue(name, value)
    if (ret) {
      const control = this._getControl(name)!
      const isPostChanges = control.IsPostChanges()

      const model = this.getCurrentRecordModel()
      ret = model
      // TODO: do we need to check the state, or can we assume that we always have a record?
      if (!isPostChanges) {
        Object.keys(model.controls).forEach((con) => {
          const conState = model.controls[con] as ControlState
          if (conState.name && !conState.isPostChanges) {
            const setValue = this.pm.ExecuteMethod(
              'GetFormattedFieldValue',
              this._getControl(con)
            ) as string
            conState.value = this._getJSValue(setValue, conState)
          }
        })
      }
    }
    return ret
  }

  _setControlValueInternal(control: SiebelControl, value: unknown): unknown {
    this.pm.OnControlEvent(this.consts.get('PHYEVENT_CONTROL_FOCUS'), control)
    return this.pm.OnControlEvent(this.consts.get('PHYEVENT_CONTROL_BLUR'), control, value)
  }

  _validatePickControl(control: SiebelControl, staticPick: boolean): void {
    // Possible results:
    // no pick
    // static pick
    // dynamic pick
    // pick
    // mvg
    // ?

    const isStaticPick = this.isStatic(control)
    const uiType = control.GetUIType()

    if (staticPick) {
      // static
      if (!isStaticPick) {
        warn(
          `[NB]It seems the getStaticLOV called for not static control ${control.GetName()} - ${uiType}.`
        )
      }
    } else {
      // dynamic
      if (isStaticPick) {
        warn(`[NB]It seems the getDynamicLOV called for static control ${control.GetName()}.`)
      }
      if (this.consts.get('SWE_CTRL_COMBOBOX') !== uiType) {
        // the control is not "JComboBox"
        switch (uiType) {
          case this.consts.get('SWE_CTRL_PICK'): // Pick
          case this.consts.get('SWE_CTRL_MVG'): // MVG
            warn(
              `[NB]You need to use the popups instead of getDynamicLOV - ${uiType}/${control.GetName()}.`
            )
            break
          default:
            warn(
              `[NB]Maybe getDynamicLOV won't work for this control - ${uiType}/${control.GetName()}.`
            )
        }
      }
    }
  }

  isStatic(control: SiebelControl): boolean {
    return '1' === control.IsStaticBounded()
  }

  isDynamic(control: SiebelControl): boolean {
    return (
      !this.isStatic(control) && this.consts.get('SWE_CTRL_COMBOBOX') === control.GetUIType()
    )
  }

  _getControlDynamicLOV(control: SiebelControl): unknown {
    const controlInputName = control.GetInputName()
    this.lov[controlInputName] = {}
    const ps = window.SiebelApp.S_App.NewPropertySet()
    ps.SetProperty('SWEField', controlInputName)
    ps.SetProperty('SWEJI', false)
    this._setActiveControl(null) // to prevent UpdatePick
    this.pm.ExecuteMethod('InvokeMethod', 'GetQuickPickInfo', ps)
    return this.lov[controlInputName]
  }

  getLOV(controlName: string): unknown {
    // TODO: check if controlName populated
    const control = this._getControl(controlName)!
    if (this.isStatic(control)) {
      return BaseApplet.GetControlStaticLOV(control)
    }
    if (!this.isDynamic(control)) {
      // Take the dynamic path in the hope that it will work

      warn(`[NB]It seems ${controlName} is not properly configured in the Tools or not a picklist.`)
    }
    return this._getControlDynamicLOV(control)
  }

  getDynamicLOV(controlName: string): unknown {
    const control = this._getControl(controlName)!
    this._validatePickControl(control, false)
    return this._getControlDynamicLOV(control)
  }

  getStaticLOV(controlName: string): string[] {
    const control = this._getControl(controlName)!
    this._validatePickControl(control, true)
    return BaseApplet.GetControlStaticLOV(control)
  }

  _getJSValue(
    value: string,
    {
      uiType,
      dataType,
      displayFormat,
      currencyCode,
    }: { uiType: string; dataType: string; displayFormat: string; currencyCode?: string }
  ): unknown {
    if (this.consts.get('SWE_CTRL_CHECKBOX') === uiType) {
      // convert Y/N/null -> true/false // null comes as false?
      this.boolObject.SetAsString(value)
      return this.boolObject.GetValue()
    }
    if (this.convertDates && displayFormat && this._isDateTimeControl(uiType)) {
      if (value === '') {
        return null
      }
      // assuming that form applet returns not formatted values
      const ISO = window.SiebelApp.S_App.LocaleObject.GetStringFromDateTime(
        value,
        displayFormat,
        this.consts.get('ISO8601_DATETIME_FORMAT'),
        true // AK fix to keep : or / (instead of taking local time or date separator)
      )
      if (ISO === '') {
        throw new ConnectError(
          `[NB] ISO value is empty after converting ${value} using ${displayFormat} format`
        )
      }
      const fix = ISO.replace(/-/g, '/')
      return new Date(fix)
    }
    if (
      (this.returnRawNumbers && 'number' === dataType) ||
      (this.returnRawIntegers && 'integer' === dataType)
    ) {
      // it is already not formatted on form applet, so only for list applet
      return window.SiebelApp.S_App.LocaleObject.FormattedToString(dataType, value, displayFormat)
    }
    if (this.returnRawCurrencies && 'currency' === dataType) {
      // it is already not formatted on form applet, so only for list applet
      if (currencyCode) {
        window.SiebelApp.S_App.LocaleObject.SetCurrencyCode(currencyCode) // TODO: do we need to restore the m_sCurrencyCode?
      }
      return window.SiebelApp.S_App.LocaleObject.FormattedToString(dataType, value, displayFormat)
    }
    return value
  }

  getCurrentRecord(raw?: boolean): TRecord | undefined {
    // TODO: need conversion?
    // TODO: check if there is a record
    const index = this.getSelection()
    // TODO: make a copy of returned object?
    if (raw) {
      return this.getRawRecordSet()[index]
    }
    return this.getRecordSet()[index]
  }

  calculateCurrentRecordState(): CurrentRecordState {
    // 0 - No records displayed
    // 1 - Record is being created
    // 2 - Record is being edited
    // 3 - Is in query mode
    // 4 - Record is displayed,
    // 5 - Record is read-only

    const bc = this.pm.Get('GetBusComp') as SiebelBusComp

    if (this.pm.Get('IsInQueryMode')) {
      // if no records and the entered the query mode,
      // selection is -1, therefore we need to check query mode first
      return 3
    }
    if (this.getSelection() < 0) {
      return 0
    }
    if (bc.IsInsertPending()) {
      // or insertPending property
      return 1
    }
    if (bc.IsCommitPending()) {
      // bc.commitPending or this.pm.GetStateUIMap().CommitPending
      return 2
    }
    if (!this.canInvokeMethod('WriteRecord')) {
      // or use the canUpdate property of the BC?
      return 5
    }

    return 4 // this is a default fallback;
  }

  _getMethods(): Record<string, boolean> {
    const methods: Record<string, boolean> = {}
    const appletControls = this.pm.Get('GetControls') as Record<string, SiebelControl> // even for list applet
    const arr = Object.entries(appletControls)
    arr.forEach((controlEntry) => {
      const controlMethod = controlEntry[1].GetMethodName()
      if (typeof controlMethod !== 'undefined' && controlMethod !== '') {
        methods[controlMethod] = {} as unknown as boolean
      }
    })
    return methods
  }

  getControlDisplayFormat(uiType: string): string {
    switch (uiType) {
      case this.consts.get('SWE_CTRL_DATE_TZ_PICK'):
      case this.consts.get('SWE_CTRL_DATE_TIME_PICK'):
        return this.localeData.dateTimeFormat
      case this.consts.get('SWE_CTRL_DATE_PICK'):
        return this.localeData.dateFormat
      default:
        return ''
    }
  }

  getCurrentRecordModel(
    _controls?: Record<string, ControlModel>,
    _methods?: Record<string, boolean>
  ): RecordModel {
    if (!_controls) {
      _controls = this.getControls()
    }
    // `_controls` is mutated from a ControlModel map into a ControlState map (plus state/id), exactly
    // as the legacy object did; the working view is loose, the return type clean.
    const working = _controls as unknown as Record<string, unknown> & {
      state: CurrentRecordState
      id: string
    }
    working.state = this.calculateCurrentRecordState()
    working.id = ''
    let obj: TRecord | Record<string, unknown> = {}
    const index = this.getSelection()
    const rawRecordSet = this.getRawRecordSet()
    if (index > -1) {
      // added _controls.state !== 3; we don't need id in query mode
      obj = this.getRecordSet()[index]!
      working.id = rawRecordSet[index]!.Id
    }
    const appletControls = this._returnControls()
    const list = this.pm.Get('GetListOfColumns') as Record<string, unknown>
    // populate controls
    Object.keys(_controls).forEach((controlName) => {
      let ret: Partial<ControlState> = {}
      const control = appletControls[controlName]
      // just if somebody sends incorrect name of the control
      if (typeof control !== 'undefined') {
        const fieldName = control.GetFieldName()
        const uiType = control.GetUIType()
        const displayFormat = control.GetDisplayFormat() || this.getControlDisplayFormat(uiType)
        const staticPick = control.IsStaticBounded() === '1'
        const dataType = this.pm.ExecuteMethod('GetFieldDataType', fieldName) as string
        let currencyCodeField = ''
        let currencyCode = ''
        if ('currency' === dataType) {
          currencyCodeField = this._getCurrencyCodeField(control)
          if (currencyCodeField && index > -1 && rawRecordSet[index]) {
            currencyCode = rawRecordSet[index]![currencyCodeField] as string
          }
        }
        if (working.id && working.state !== 3) {
          ret = {
            value: this._getJSValue((obj as Record<string, string>)[fieldName]!, {
              uiType,
              dataType,
              displayFormat,
              currencyCode,
            }),
            readonly: !this.pm.ExecuteMethod('CanUpdate', controlName),
            isLink: this.pm.ExecuteMethod('CanNavigate', controlName) as boolean,
          }
        } else {
          // no record displayed or in query mode
          ret = {
            value: '',
            readonly: working.state !== 3, // should be edittable in query mode
            isLink: false,
          }
        }
        working[controlName] = Object.assign(ret, {
          uiType,
          label: control.GetDisplayName(),
          isPostChanges: control.IsPostChanges(),
          // keep required if it was in the template object
          // it was workaround for not having required on list applet, but do we need it now?
          required:
            (working[controlName] as ControlModel | undefined)?.required ||
            this._isRequired(control.GetInputName()),
          maxSize: control.GetMaxSize(),
          fieldName,
          displayFormat,
          isLOV: staticPick || this.consts.get('SWE_CTRL_COMBOBOX') === uiType,
          dataType,
          currencyCodeField,
          currencyCode,
          name: controlName,
          iconMap: this._getIconMap(control),
          isListColumn: !!(this.isListApplet && list[controlName]),
        })
      }
    })
    const idControl = working.Id as ControlState | undefined
    if (idControl && !idControl.value) {
      idControl.value = working.state !== 3 ? working.id : ''
    }
    // populate methods
    // Is it better to use applet.GetCanInvokeArray?
    _methods = _methods || this._getMethods()
    Object.keys(_methods).forEach((methodName) => {
      _methods![methodName] = this.canInvokeMethod(methodName)
    })
    return {
      controls: working as unknown as RecordModel['controls'],
      methods: _methods,
    }
  }

  _findControlToEnterSearchExpr(controlName?: string): SiebelControl {
    const appletControls = this._returnControls()
    if (controlName) {
      const control = appletControls[controlName]
      if (!control) {
        throw new ControlNotFoundError(
          `[NB]${this.appletName} does not have a control ${controlName}`,
          { appletName: this.appletName, controlName }
        )
      }
      // TODO: trust dev OR need validate the UiType?
      return control
    }
    const arr = Object.values(appletControls)
    const found = arr.find((control) => {
      const controlUiType = control.GetUIType()
      const fieldName = control.GetFieldName()
      let ret =
        controlUiType !== 'null' &&
        ![
          this.consts.get('SWE_CTRL_CHECKBOX'),
          this.consts.get('SWE_PST_BUTTON_CTRL'),
          this.consts.get('SWE_CTRL_PLAINTEXT'),
          this.consts.get('SWE_CTRL_LABEL'),
          this.consts.get('SWE_CTRL_LINK'),
          this.consts.get('SWE_CTRL_MVG'),
          this.consts.get('SWE_CTRL_HIDDEN'), // exclude also Hidden
        ].includes(controlUiType)

      ret = (ret && fieldName) as boolean
      return ret
    })
    if (!found) {
      throw new ControlNotFoundError(
        `[NB]${this.appletName} does not have a control to enter the search expression`,
        { appletName: this.appletName }
      )
    }
    return found
  }

  _newQuery(checkQueryMode?: boolean): unknown {
    if (checkQueryMode) {
      if (this.pm.Get('IsInQueryMode')) {
        return false
      }
    }
    const ret = this.pm.ExecuteMethod('InvokeMethod', 'NewQuery')
    if (!this.pm.Get('IsInQueryMode')) {
      logError('[NB]The applet is not in Query Mode')
      throw new QueryModeError('[NB]The applet is not in Query Mode', { appletName: this.appletName })
    }
    return ret
  }

  queryBySearchExpr(expr: string, checkQueryMode?: boolean, controlName?: string): Promise<unknown> {
    return new Promise((resolve) => {
      this._newQuery(checkQueryMode)

      const ai = {
        scope: this,
        async: true,
        selfbusy: true,
        cb: resolve,
      }

      const control = this._findControlToEnterSearchExpr(controlName)
      this._setControlValueInternal(control, expr)
      return this.pm.ExecuteMethod('InvokeMethod', 'ExecuteQuery', null, ai)
    })
  }

  queryBySearchExprSync(expr: string, checkQueryMode?: boolean, controlName?: string): number {
    this._newQuery(checkQueryMode)
    const control = this._findControlToEnterSearchExpr(controlName)
    this._setControlValueInternal(control, expr)
    this.pm.ExecuteMethod('InvokeMethod', 'ExecuteQuery')
    return this.getRecordSet().length
  }

  queryByIdSync(rowId: string | string[], checkQueryMode?: boolean, controlName?: string): number {
    let expr: string
    if (Array.isArray(rowId)) {
      expr = rowId.map((el) => `Id="${el}"`).join(' OR ')
    } else {
      expr = `Id="${rowId}"`
    }
    return this.queryBySearchExprSync(expr, checkQueryMode, controlName)
  }

  queryById(
    rowId: string,
    cb?: (count: number) => unknown,
    checkQueryMode?: boolean,
    controlName?: string
  ): Promise<unknown> {
    const promise = new Promise((resolve) =>
      this._queryById(rowId, resolve, checkQueryMode, controlName)
    )
    const ret = promise.then(() => this.getRecordSet().length)
    return typeof cb === 'function' ? ret.then(cb) : ret
  }

  _queryById(
    rowId: string,
    cb?: (...args: unknown[]) => unknown,
    checkQueryMode?: boolean,
    controlName?: string
  ): unknown {
    this._newQuery(checkQueryMode)

    const ai: { scope: unknown; async: boolean; selfbusy: boolean; cb?: (...args: unknown[]) => unknown } =
      {
        scope: this,
        async: true,
        selfbusy: true,
      }
    if (typeof cb === 'function') {
      ai.cb = cb
    }

    const control = this._findControlToEnterSearchExpr(controlName)
    this._setControlValueInternal(control, `Id="${rowId}"`)
    return this.pm.ExecuteMethod('InvokeMethod', 'ExecuteQuery', null, ai)
  }

  query(
    params: Record<string, unknown>,
    cb?: (count: number) => unknown,
    checkQueryMode?: boolean
  ): Promise<unknown> {
    const promise = new Promise((resolve) => this._query(params, resolve, checkQueryMode))
    const ret = promise.then(() => this.getRecordSet().length)
    return typeof cb === 'function' ? ret.then(cb) : ret
  }

  _query(
    params: Record<string, unknown>,
    cb?: (...args: unknown[]) => unknown,
    checkQueryMode?: boolean
  ): unknown {
    this._newQuery(checkQueryMode)

    const ai: { scope: unknown; async: boolean; selfbusy: boolean; cb?: (...args: unknown[]) => unknown } =
      {
        scope: this,
        async: true,
        selfbusy: true,
      }
    if (typeof cb === 'function') {
      ai.cb = cb
    }

    const _controls = this._returnControls()
    const arr = Object.keys(params)
    arr.forEach((controlName) => {
      const control = _controls[controlName]
      if (control) {
        this._setControlValueInternal(
          control,
          this._getSiebelValue(params[controlName], control.GetUIType())
        )
      } else {
        logError(`[NB] The control "${controlName}" is not found`)
      }
    })

    return this.pm.ExecuteMethod('InvokeMethod', 'ExecuteQuery', null, ai)
  }

  static Requery(name: string): void {
    const service = window.SiebelApp.S_App.GetService('Nexus BS')
    const inPropSet = window.SiebelApp.S_App.NewPropertySet()
    inPropSet.SetProperty('name', name)
    service.InvokeMethod('Requery', inPropSet, {})
  }

  static Refresh(name: string): void {
    const service = window.SiebelApp.S_App.GetService('Nexus BS')
    const inPropSet = window.SiebelApp.S_App.NewPropertySet()
    inPropSet.SetProperty('name', name)
    service.InvokeMethod('Refresh', inPropSet, {})
  }

  getMVF(ids: string[], fields: Record<string, string[]>, useActiveBO?: boolean): Promise<MvfResult> {
    return new Promise((resolve, reject) => this._getMVF(ids, fields, useActiveBO, resolve, reject))
  }

  _getFieldNameForControl(controlName: string): string {
    const control = this._getControl(controlName)
    // if not found, the input value is returned
    if (control) {
      return control.GetFieldName()
    }
    return controlName // fallback - just in case we got the field name
  }

  _getMVF(
    ids: string[],
    fields: Record<string, string[]>,
    useActiveBO: boolean | undefined,
    resolve: (value: MvfResult) => void,
    reject: () => void
  ): unknown {
    const arr = Object.entries(fields)
    const psInputs = window.SiebelApp.S_App.NewPropertySet()
    psInputs.SetProperty('BO', window.SiebelApp.S_App.GetActiveBusObj().GetName())
    psInputs.SetProperty('BC', (this.pm.Get('GetBusComp') as SiebelBusComp).GetName())
    psInputs.SetProperty('UseActiveBO', useActiveBO ? 'Y' : 'N')
    psInputs.SetProperty('ID', ids.join(','))
    arr.forEach((el) => {
      const ps = window.SiebelApp.S_App.NewPropertySet()
      ps.SetType(this._getFieldNameForControl(el[0]))
      ps.SetProperty('Fields', el[1].join(','))
      psInputs.AddChild(ps.Clone())
    })
    const bs = window.SiebelApp.S_App.GetService('Nexus BS')
    const ai = {
      async: true,
      selfbusy: true,
      scope: this,
      errcb: () => {
        reject()
      },
      cb: (_methodName: string, _Inputs: SiebelPropertySet, psOutputs: SiebelPropertySet) => {
        const ret: MvfResult = {}
        const resultSet = psOutputs.GetChildByType('ResultSet')
        if (!resultSet) {
          throw new ConnectError(
            '[NB] ResultSet is not found in the output returned by business service'
          )
        }
        const { childArray } = resultSet
        if (childArray) {
          childArray.forEach((child) => {
            const group: Record<string, Array<Record<string, unknown>>> = {}
            ret[child.GetType()] = group
            child.childArray.forEach((grandChild) => {
              group[grandChild.GetType()] = grandChild.childArray.map((rec) => {
                const primary = rec.propArray['SSA Primary Field']!
                this.boolObject.SetAsString(primary)
                rec.propArray['SSA Primary Field'] = this.boolObject.GetValue() as unknown as string
                return Object.assign({}, rec.propArray)
              })
            })
          })
        }
        resolve(ret)
      },
    }
    return bs.InvokeMethod('ReturnMVGFields', psInputs, ai)
  }

  savePref(name: string, value: string): unknown {
    // value is a string, and bound to applet and view
    const psInput = window.SiebelApp.S_App.NewPropertySet()
    psInput.SetProperty('Key', name)
    psInput.SetProperty(name, value)
    this.pm.OnControlEvent(
      this.consts.get('PHYEVENT_INVOKE_CONTROL'),
      this.pm.Get(this.consts.get('SWE_MTHD_UPDATE_USER_PREF')),
      psInput
    )
    return this.pm.SetProperty(name, value)
  }

  readPref(name: string): unknown {
    return this.pm.Get(name)
  }

  _retrieveData(amount: number): false | { data: SiebelRecord[]; hasNext: boolean } {
    // could be removed in the next version
    // it starts from the current position
    if (!this.isListApplet) {
      return false
    }

    const data = new Map<string, SiebelRecord>()
    const allRecords = amount === 0

    while (data.size < amount || allRecords) {
      const arr = this.getRawRecordSet()

      // avoid the duplicates
      arr.forEach((el) => data.set(el.Id, el))

      // we are using canInvokeMethod, as in 16.0 nextRecordSet always returns undefined
      if (!this.canInvokeMethod('GotoNextSet')) {
        break
      }

      this.nextRecordSet()
    }

    return {
      data: [...data.values()],
      hasNext: this.canInvokeMethod('GotoNextSet'),
    }
  }

  // this is also called from the the demo where Siebel and custom rendered applet coexist
  _getFieldToControlMap(_controls?: Record<string, unknown>): Record<string, FieldControlInfo> {
    // list applet has the GetColumnsByFieldName that could be used for that purpose
    const ret: Record<string, FieldControlInfo> = {}
    const appletControls = this._returnControls()
    const arr = Object.keys(_controls || appletControls)
    arr.forEach((controlName) => {
      const control = appletControls[controlName]
      if (typeof control !== 'undefined') {
        // just in case somebody gave the incorrect control name
        const fieldName = control.GetFieldName()
        if (fieldName) {
          const uiType = control.GetUIType()
          const dataType = this.pm.ExecuteMethod('GetFieldDataType', fieldName) as string
          ret[fieldName] = {
            name: controlName,
            isPostChanges: control.IsPostChanges(),
            uiType,
            displayFormat: control.GetDisplayFormat() || this.getControlDisplayFormat(uiType),
            dataType,
            currencyCodeField:
              'currency' === dataType ? this._getCurrencyCodeField(control) : '',
          }
        }
      }
    })
    return ret
  }

  getControlsRecordsObject(addRecordIndex?: boolean): Record<string, TRecord> {
    const arr = this.getControlsRecordSet(addRecordIndex)
    return arr.reduce<Record<string, TRecord>>((res, record) => {
      res[record.Id] = record
      return res
    }, {})
  }

  getControlsRecordSet(addRecordIndex?: boolean): TRecord[] {
    // used slice to avoid modification of the record set
    const ret = this.getRecordSet(addRecordIndex)
    const rawRecordSet = this.getRawRecordSet() // TODO: Analyze IsInQueryMode before applying?

    for (let i = 0, len = ret.length; i < len; i += 1) {
      const record = ret[i] as Record<string, unknown>
      const obj: Record<string, unknown> = { Id: record.Id }
      if (addRecordIndex) {
        obj._indx = record._indx
      }
      ret[i] = Object.assign(
        obj,
        Object.keys(record)
          .filter((el) => this.fieldToControlMap[el])
          .reduce((acc, el) => {
            const info = this.fieldToControlMap[el]!
            return {
              ...acc,
              ...{
                [info.name]: this._getJSValue(record[el] as string, {
                  uiType: info.uiType,
                  dataType: info.dataType,
                  displayFormat: info.displayFormat,
                  currencyCode: ((rawRecordSet[i] || {}) as Record<string, unknown>)[
                    info.currencyCodeField
                  ] as string,
                }),
              },
            }
          }, {})
      ) as unknown as TRecord
    }

    return ret
  }

  sort(controlName: string, isAscending?: boolean): boolean {
    // TODO: check if dataset is sortable? e.g. not in query or in insert mode?
    // TODO: check if we can sort by this control?
    if (this.isListApplet) {
      const sortOrder = isAscending
        ? this.consts.get('SORT_ASCENDING')
        : this.consts.get('SORT_DESCENDING')
      this.pm.ExecuteMethod('OnClickSort', controlName, sortOrder)
      return true
    }
    return false
  }

  getPaginationInfo(): PaginationInfo {
    const start = this.pm.ExecuteMethod('GetWSStartRowNum') as number
    const end = this.pm.Get('GetWSEndRowNum') as number // 0 in query mode
    const hasMore = this.pm.Get('IsInQueryMode') ? false : !this.pm.Get('IsNumRowsKnown')

    return {
      start,
      end,
      total: this.getNumRows(),
      hasMore,
      current: this.getSelection() + start,
    }
  }

  _getMockData(): RecordModel & { items: Record<string, TRecord> } {
    return Object.assign(this.getCurrentRecordModel(), {
      items: this.getControlsRecordsObject(),
    })
  }

  // TODO: should be static?
  getPopupType(): PopupType {
    // null, pick, mvgassoc, mvg, assoc, popup
    const pm = window.SiebelApp.S_App.GetPopupPM()
    if (!pm) {
      return null
    }

    // check state? unloaded, hidden or visible
    if (pm.Get('state') !== this.consts.get('POPUP_STATE_VISIBLE')) {
      // not visible
      return null
    }

    if (pm.Get('isPopupPick')) {
      return 'pick'
    }
    const mvg = pm.Get('isPopupMVGSelected')
    if (mvg && pm.Get('isPopupMVGAssoc')) {
      // TODO: maybe better check
      // currPopups.length, MVGAssocAppletObject, MVGAssocParentAppletObject
      return 'mvgassoc'
    }
    if (mvg) {
      return 'mvg'
    }
    if (pm.Get('isPopupAssoc')) {
      return 'assoc'
    }
    return 'popup'
  }
}
