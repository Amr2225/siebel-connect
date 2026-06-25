import { describe, it, expect } from 'vitest'
import {
  ConnectError,
  AppletNotFoundError,
  MethodNotSupportedError,
  PositionError,
  PopupError,
  QueryModeError,
  ReadonlyControlError,
  ControlNotFoundError,
  type ConnectErrorContext,
} from 'siebel-connect'

const subclasses = [
  AppletNotFoundError,
  MethodNotSupportedError,
  PositionError,
  PopupError,
  QueryModeError,
  ReadonlyControlError,
  ControlNotFoundError,
] as const

describe('ConnectError hierarchy', () => {
  it('every subclass is an instanceof ConnectError and Error', () => {
    for (const Subclass of subclasses) {
      const err = new Subclass('boom')
      expect(err).toBeInstanceOf(ConnectError)
      expect(err).toBeInstanceOf(Error)
    }
  })

  it('sets name to the concrete subclass name', () => {
    expect(new ConnectError('x').name).toBe('ConnectError')
    expect(new AppletNotFoundError('x').name).toBe('AppletNotFoundError')
    expect(new MethodNotSupportedError('x').name).toBe('MethodNotSupportedError')
    expect(new PositionError('x').name).toBe('PositionError')
    expect(new PopupError('x').name).toBe('PopupError')
    expect(new QueryModeError('x').name).toBe('QueryModeError')
    expect(new ReadonlyControlError('x').name).toBe('ReadonlyControlError')
    expect(new ControlNotFoundError('x').name).toBe('ControlNotFoundError')
  })

  it('preserves the verbatim message text', () => {
    // The exact original strings (incl. prefix + spacing) must survive untouched.
    expect(new ControlNotFoundError('[NB] Control Foo is not found').message).toBe(
      '[NB] Control Foo is not found',
    )
    expect(new ReadonlyControlError('[NB] The control Name is read-only.').message).toBe(
      '[NB] The control Name is read-only.',
    )
    expect(new AppletNotFoundError('[NF] Applet not found: accountList').message).toBe(
      '[NF] Applet not found: accountList',
    )
    expect(new QueryModeError('[NB]The applet is not in Query Mode').message).toBe(
      '[NB]The applet is not in Query Mode',
    )
  })

  it('carries structured context when provided', () => {
    const context: ConnectErrorContext = {
      appletName: 'Account List Applet',
      method: 'DeleteRecord',
      controlName: 'Name',
    }
    const err = new MethodNotSupportedError('[NB] delete not supported', context)
    expect(err.appletName).toBe('Account List Applet')
    expect(err.method).toBe('DeleteRecord')
    expect(err.controlName).toBe('Name')
  })

  it('omits context fields that were not provided (no undefined own-properties)', () => {
    const err = new ControlNotFoundError('[NB] Control Foo is not found', { controlName: 'Foo' })
    expect(err.controlName).toBe('Foo')
    expect('appletName' in err).toBe(false)
    expect('method' in err).toBe(false)
  })

  it('is catchable by base or specific type', () => {
    const thrower = () => {
      throw new ReadonlyControlError('[NB] The control Name is read-only.', { controlName: 'Name' })
    }
    expect(thrower).toThrow(ConnectError)
    expect(thrower).toThrow(ReadonlyControlError)
    expect(thrower).toThrow('[NB] The control Name is read-only.')
  })
})
