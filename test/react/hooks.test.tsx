// React adapter tests (Phase 10). Exercise the hooks against the in-memory Siebel harness, asserting
// the re-render-minimisation contract the store was built for: an unrelated notification must not
// re-render a component reading a single record slice, while a real record-set change re-renders
// exactly once. Also covers `useAsyncAction`'s pending/error lifecycle and cross-unmount cleanup.
import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  useApplet,
  useRecordSet,
  useCurrentRecord,
  useAsyncAction,
} from 'siebel-connect/react'
import { init, clear, getApplet, ConnectError } from 'siebel-connect'
import { createMockSiebel } from 'siebel-connect/testing'
import { accountListFixture, type Account } from '../fixtures/applets'

declare module 'siebel-connect' {
  interface AppletRegistry {
    reactList: Account
  }
}

let siebel: ReturnType<typeof createMockSiebel> | undefined

afterEach(() => {
  cleanup()
  try {
    clear(['reactList'])
  } catch {
    // already cleared
  }
  siebel?.destroy()
  siebel = undefined
})

function setup() {
  siebel = createMockSiebel({ applets: [accountListFixture] })
  init({ reactList: accountListFixture.name })
  return siebel
}

/**
 * Emit a BC notification batch inside `act` so React flushes any scheduled re-render. Defaults to an
 * unconditionally-accepted type (`NEW_RECORD`), so the store always recomputes its snapshot — which is
 * exactly what makes the "recomputed but slice unchanged → no re-render" assertions meaningful.
 */
function emit(s: ReturnType<typeof createMockSiebel>, type = 'SWE_PROP_BC_NOTI_NEW_RECORD') {
  act(() => {
    s.emitBatch(accountListFixture.name, [{ type }])
  })
}

describe('useCurrentRecord re-render minimisation', () => {
  it('does not re-render when an accepted notification leaves the selected record unchanged', () => {
    const s = setup()
    let renders = 0
    function Probe() {
      renders += 1
      const current = useCurrentRecord('reactList')
      return <span data-testid="name">{current?.Name}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('name').textContent).toBe('Acme')
    expect(renders).toBe(1)

    emit(s) // unrelated batch: record set re-read, but the selected record's fields are identical
    emit(s)

    expect(renders).toBe(1) // no extra render: shallow-equal slice
    expect(screen.getByTestId('name').textContent).toBe('Acme')
  })
})

describe('useRecordSet', () => {
  it('returns the typed record set and re-renders once per relevant batch', () => {
    const s = setup()
    let renders = 0
    function Probe() {
      renders += 1
      const rows = useRecordSet('reactList')
      return <span data-testid="names">{rows.map((r) => r.Name).join(',')}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('names').textContent).toBe('Acme,Globex,Initech')
    expect(renders).toBe(1)

    // Change the backing record set, then fire one batch: exactly one additional render.
    s.getPM(accountListFixture.name).set('GetRecordSet', [
      { Id: '1-A', Name: 'Acme', Location: 'NY' },
      { Id: '1-B', Name: 'Globex', Location: 'LA' },
      { Id: '1-Z', Name: 'Umbrella', Location: 'DC' },
    ])
    emit(s)

    expect(renders).toBe(2)
    expect(screen.getByTestId('names').textContent).toBe('Acme,Globex,Umbrella')
  })

  it('does not re-render when a batch leaves every row unchanged', () => {
    const s = setup()
    let renders = 0
    function Probe() {
      renders += 1
      const rows = useRecordSet('reactList')
      return <span>{rows.length}</span>
    }
    render(<Probe />)
    expect(renders).toBe(1)
    emit(s)
    expect(renders).toBe(1)
  })
})

describe('useAsyncAction', () => {
  it('toggles pending around an action and clears it on success', async () => {
    setup()
    let release: (() => void) | undefined
    const action = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })

    function Probe() {
      const { pending, run } = useAsyncAction()
      return (
        <div>
          <button onClick={() => run(action)}>go</button>
          <span data-testid="pending">{String(pending)}</span>
        </div>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('pending').textContent).toBe('false')

    fireEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('pending').textContent).toBe('true')

    await act(async () => {
      release?.()
    })
    expect(screen.getByTestId('pending').textContent).toBe('false')
  })

  it('surfaces a thrown ConnectError without rethrowing', async () => {
    setup()
    function Probe() {
      const { error, run } = useAsyncAction()
      return (
        <div>
          <button
            onClick={() =>
              run(() => {
                throw new ConnectError('[NB] boom')
              })
            }
          >
            go
          </button>
          <span data-testid="error">{error ? `${error.name}:${error.message}` : ''}</span>
        </div>
      )
    }
    render(<Probe />)
    await act(async () => {
      fireEvent.click(screen.getByText('go'))
    })
    expect(screen.getByTestId('error').textContent).toBe('ConnectError:[NB] boom')
  })

  it('normalises a non-Error rejection into a ConnectError', async () => {
    setup()
    function Probe() {
      const { error, run } = useAsyncAction()
      return (
        <div>
          <button onClick={() => run(() => Promise.reject(undefined))}>go</button>
          <span data-testid="error">{error instanceof ConnectError ? error.message : ''}</span>
        </div>
      )
    }
    render(<Probe />)
    await act(async () => {
      fireEvent.click(screen.getByText('go'))
    })
    expect(screen.getByTestId('error').textContent).toBe('Async action failed')
  })
})

describe('useApplet', () => {
  it('exposes the memoized applet instance and a reactive snapshot', () => {
    setup()
    let handleApplet: unknown
    function Probe() {
      const { applet, recordSet, currentRecord } = useApplet('reactList')
      handleApplet = applet
      return (
        <span data-testid="out">
          {recordSet.length}:{currentRecord?.Name}
        </span>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('out').textContent).toBe('3:Acme')
    // the handle returns the same memoized instance the imperative API hands back
    expect(handleApplet).toBe(getApplet('reactList'))
  })
})

describe('cross-unmount cleanup', () => {
  it('removes the component listener on unmount so later batches are inert', () => {
    const s = setup()
    let renders = 0
    function Probe() {
      renders += 1
      useRecordSet('reactList')
      return null
    }
    const view = render(<Probe />)
    expect(renders).toBe(1)
    view.unmount()

    // Change data and emit: the unmounted component must not render again.
    s.getPM(accountListFixture.name).set('GetRecordSet', [{ Id: 'x', Name: 'Z', Location: 'Z' }])
    emit(s)
    expect(renders).toBe(1)
  })
})
