// Type-level tests for the React hooks. The DoD: hooks are typed against the augmented
// `AppletRegistry`, so a component reads the registered record type with no `any` at the door.
import { describe, it, expectTypeOf } from 'vitest'
import {
  useRecordSet,
  useCurrentRecord,
  useApplet,
  useQueryMode,
  useAsyncAction,
} from 'siebel-connect/react'
import type { SiebelRecord, Applet, ConnectError } from 'siebel-connect'

interface Lead extends SiebelRecord {
  Status: string
}

declare module 'siebel-connect' {
  interface AppletRegistry {
    leadList: Lead
  }
}

describe('react hook inference', () => {
  it('useRecordSet infers readonly RecordOf<K>[]', () => {
    expectTypeOf(useRecordSet('leadList')).toEqualTypeOf<readonly Lead[]>()
    expectTypeOf(useRecordSet('leadList')).not.toBeAny()
  })

  it('useCurrentRecord infers RecordOf<K> | undefined', () => {
    expectTypeOf(useCurrentRecord('leadList')).toEqualTypeOf<Lead | undefined>()
  })

  it('useApplet exposes the typed instance and snapshot slices', () => {
    const handle = useApplet('leadList')
    expectTypeOf(handle.applet).toEqualTypeOf<Applet<Lead>>()
    expectTypeOf(handle.recordSet).toEqualTypeOf<readonly Lead[]>()
    expectTypeOf(handle.currentRecord).toEqualTypeOf<Lead | undefined>()
    expectTypeOf(handle.inQueryMode).toEqualTypeOf<boolean>()
  })

  it('useQueryMode / useAsyncAction surface a typed ConnectError', () => {
    expectTypeOf(useQueryMode('leadList').error).toEqualTypeOf<ConnectError | undefined>()
    expectTypeOf(useAsyncAction().error).toEqualTypeOf<ConnectError | undefined>()
  })

  it('the run helper preserves the action result type', () => {
    expectTypeOf(useAsyncAction().run(() => 42)).resolves.toEqualTypeOf<number | undefined>()
  })
})
