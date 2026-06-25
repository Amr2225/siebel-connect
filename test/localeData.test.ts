import { describe, it, expect, afterEach } from 'vitest'
import { LocaleData } from 'siebel-connect'
import { createMockSiebel } from 'siebel-connect/testing'
import { allApplets } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  siebel?.destroy()
  siebel = undefined
})

describe('LocaleData singleton', () => {
  it('is a singleton that reads formats from the mock LocaleObject', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const a = LocaleData.instance
    const b = LocaleData.instance
    expect(a).toBe(b)

    expect(a.firstDayOfWeek).toBe(0)
    expect(a.months).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    expect(a.shortMonths).toHaveLength(12)
    expect(a.weekDays).toHaveLength(7)
    // GetProfile returns '' in the mock, so the dateTimeFormat is not 'p'-suffixed -> 24h.
    expect(a.is24hoursFormat).toBe(true)
    expect(a.currencyDecimal).toBe('.')
  })

  it('refuses direct construction (Symbol enforcer)', () => {
    expect(() => new LocaleData()).toThrow(
      '[NB] Instantiation failed: get locale data singleton instance instead of new.',
    )
  })
})
