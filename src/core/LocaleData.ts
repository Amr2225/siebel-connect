// LocaleData.ts — locale-formats singleton (ported verbatim from NexusLocaleData).
//
// Phase 05 port. Behaviour is unchanged from the legacy `NexusLocaleData`: a Symbol-enforced
// singleton that reads every locale format off `S_App.LocaleObject` once, at first `instance` access.
// Only the types and the class name change. The two private symbols reproduce the legacy
// "you cannot `new` this" guard exactly: `instance` is the only sanctioned constructor caller.

const singleton = Symbol('singleton')
const singletonEnforcer = Symbol('singletonEnforcer')

/** Locale formats read from Siebel's `LocaleObject`, exposed as a process-wide singleton. */
export default class LocaleData {
  /** Siebel constants table, resolved via `SiebelJS.Dependency` (matches the legacy constructor). */
  readonly consts: SiebelConstants

  dateTimeFormat!: string
  firstDayOfWeek!: number
  dateFormat!: string
  is24hoursFormat!: boolean
  localCountryPhoneCode!: string
  currencyDecimal!: unknown
  currencySeparator!: unknown
  numberDecimal!: unknown
  numberSeparator!: unknown
  months!: string[]
  shortMonths!: string[]
  weekDays!: string[]
  weekDays3!: string[]
  weekDays1!: string[]

  private static [singleton]?: LocaleData

  static get instance(): LocaleData {
    if (!LocaleData[singleton]) {
      LocaleData[singleton] = new LocaleData(singletonEnforcer)
    }
    return LocaleData[singleton]
  }

  constructor(enforcer?: symbol) {
    if (enforcer !== singletonEnforcer) {
      throw new Error('[NB] Instantiation failed: get locale data singleton instance instead of new.')
    }
    this.consts = window.SiebelJS.Dependency('window.SiebelApp.Constants') as SiebelConstants
    this.loadLocaleData()
  }

  loadLocaleData(): void {
    const localeObject = window.SiebelApp.S_App.LocaleObject

    this.dateTimeFormat = localeObject.GetProfile(this.consts.get('LOCAL_DATETIME_FORMAT'))
    this.firstDayOfWeek = localeObject.GetWeekStartDay()
    this.dateFormat = localeObject.GetProfile(this.consts.get('LOCAL_DATE_FORMAT'))
    this.is24hoursFormat = !/p$/.test(this.dateTimeFormat)
    this.localCountryPhoneCode = localeObject.GetProfile(this.consts.get('LOCAL_PHONE_COUNTRY'))
    this.currencyDecimal = localeObject.GetDispCurrencyDecimal()
    this.currencySeparator = localeObject.GetDispCurrencySeparator()
    this.numberDecimal = localeObject.GetDispNumberDecimal()
    this.numberSeparator = localeObject.GetDispNumberSeparator()

    this.months = Array.from({ length: 12 }, (_el, i) => localeObject.GetMonth(i + 1, false))
    this.shortMonths = Array.from({ length: 12 }, (_el, i) => localeObject.GetMonth(i + 1, true))

    this.weekDays = Array.from({ length: 7 }, (_el, i) => localeObject.GetDayOfWeek(i, 0))
    this.weekDays3 = Array.from({ length: 7 }, (_el, i) => localeObject.GetDayOfWeek(i, 1))
    this.weekDays1 = Array.from({ length: 7 }, (_el, i) => localeObject.GetDayOfWeek(i, 2))
  }
}
