// Typed error hierarchy for siebel-connect.
//
// The original nexus-bridge / nexus-factory threw bare `Error`s with `[NB]` / `[NF]` prefixed
// strings (e.g. `throw new Error('[NB] The control Foo is read-only.')`). Catching them meant
// string-matching the message. `ConnectError` keeps those exact, observable message strings while
// adding a typed class per failure mode plus structured context, so call sites can `catch` by type:
//
// ```ts
// try { applet.deleteRecordSync(true) }
// catch (e) { if (e instanceof MethodNotSupportedError) { /* surface "delete not supported" */ } }
// ```
//
// Parity rule (Phase 03 spec): the *message text*, including its prefix and spacing, is reproduced
// verbatim at each future throw site. Wiring these into the ported methods happens in their own port
// phases; this module only defines the shapes. Each subclass documents the original string(s) it
// stands in for so porters copy them exactly and nothing drifts.

/** Structured context attached to a {@link ConnectError}. All fields are optional. */
export interface ConnectErrorContext {
  /** Applet the failure relates to (`this.appletName` in the bridge). */
  readonly appletName?: string
  /** Siebel method name involved (e.g. `'DeleteRecord'`, `'NewRecord'`). */
  readonly method?: string
  /** Control / list-column name involved. */
  readonly controlName?: string
}

/**
 * Base class for every error siebel-connect throws. Extends the native `Error`; the `message` is the
 * verbatim original string so existing behaviour (and any consumer string-matching) is preserved.
 * Catch this to handle any siebel-connect failure, or a subclass for a specific one.
 */
export class ConnectError extends Error {
  readonly appletName?: string
  readonly method?: string
  readonly controlName?: string

  constructor(message: string, context: ConnectErrorContext = {}) {
    super(message)
    this.name = 'ConnectError'
    // Assign only when present so `exactOptionalPropertyTypes` keeps the property absent (not `undefined`).
    if (context.appletName !== undefined) this.appletName = context.appletName
    if (context.method !== undefined) this.method = context.method
    if (context.controlName !== undefined) this.controlName = context.controlName
  }
}

/**
 * A requested applet was not found.
 *
 * Verbatim originals (nexus-factory `index.ts`):
 * - `` `[NF] Applet not found: ${appletName}` ``
 * - `` `[NF] '${key}' is not found among NB instances` ``
 */
export class AppletNotFoundError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'AppletNotFoundError'
  }
}

/**
 * An applet/BC method cannot be invoked in the current state. This is the class behind the recurring
 * "DeleteMethod is not supported" failures.
 *
 * Verbatim originals:
 * - `'[NB]The method CloseApplet is not allowed'` (NexusPopupController)
 * - `'[NB] NewRecord is not available'` (index.js)
 */
export class MethodNotSupportedError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'MethodNotSupportedError'
  }
}

/**
 * An invalid record position / index was given to a navigation method.
 *
 * Verbatim originals (NexusBaseApplet, `positionOnRow`):
 * - `'[NB] Method PositionOnRow is allowed only for list applets'`
 * - `` `[NB] The index for positionOnRow should be integer number, given value - ${index}` ``
 * - `` `[NB] Incorrect index given for positionOnRow - ${index}` ``
 * - `` `[NB] ${index} is equal/higher than allowed amount of records - ${count}.` ``
 */
export class PositionError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'PositionError'
  }
}

/**
 * A popup / MVG / pick applet could not be opened, found, or closed.
 *
 * Verbatim originals (index.js, NexusPopupController):
 * - `'[NB] Cannot open popup, another popup is openning and exists resolve func'`
 * - `'[NB] Opened Popup Applet is not found in OnLoadPopupContent'`
 * - `'[NB]The popup applet was not opened by NB and "nb" is not provided'`
 * - `'[NB] No pm or the given pm is not popup applet PM'`
 */
export class PopupError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'PopupError'
  }
}

/**
 * An operation was attempted in the wrong query-mode state (in query mode when it shouldn't be, or
 * the reverse).
 *
 * Verbatim originals:
 * - `'[NB] Mvg applet cannot be opened in query mode'` (index.js)
 * - `'[NB]The applet is not in Query Mode'` (NexusBaseApplet)
 */
export class QueryModeError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'QueryModeError'
  }
}

/**
 * A value was set on a read-only control.
 *
 * Verbatim original (NexusBaseApplet, `setControlValue`):
 * - `` `[NB] The control ${name} is read-only.` ``
 */
export class ReadonlyControlError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'ReadonlyControlError'
  }
}

/**
 * A control / list column was not found on the applet.
 *
 * Verbatim originals:
 * - `` `[NB] Control ${controlName} is not found` `` (index.js)
 * - `` `[NB]${appletName} does not have a control ${controlName}` `` (NexusBaseApplet)
 * - `` `[NB] Cannot find a control by name ${name} to set ${value}.` `` (NexusBaseApplet)
 */
export class ControlNotFoundError extends ConnectError {
  constructor(message: string, context?: ConnectErrorContext) {
    super(message, context)
    this.name = 'ControlNotFoundError'
  }
}
