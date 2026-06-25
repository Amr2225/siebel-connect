# Locale data

`LocaleData` is a process-wide singleton that reads every Siebel locale format once, off
`S_App.LocaleObject`, and exposes them as plain fields. It is a verbatim port of the legacy
`NexusLocaleData`, including its Symbol-enforced singleton guard.

```ts
import { LocaleData } from 'siebel-connect'

const locale = LocaleData.instance
locale.dateTimeFormat   // e.g. 'M/D/YYYY h:mm:ss p'
locale.is24hoursFormat  // derived: false when the date-time format ends in 'p'
locale.months           // ['January', 'February', ...]
locale.firstDayOfWeek   // 0..6
```

## Singleton enforcement

You cannot `new LocaleData()`. The constructor is guarded by a private `Symbol`, so the only sanctioned
way to obtain the instance is the static `instance` getter, which lazily constructs it on first access:

```ts
new LocaleData()
// throws: [NB] Instantiation failed: get locale data singleton instance instead of new.
```

The instance is created the first time `LocaleData.instance` is read, so a mock Siebel must already be
installed (see [testing](../testing.md)) before that first access.

## Fields

Read at construction from `LocaleObject` and `Constants`:

| Field | Source |
| ----- | ------ |
| `dateTimeFormat`, `dateFormat` | `GetProfile(...)` for the locale's format profile keys |
| `is24hoursFormat` | derived: `!/p$/.test(dateTimeFormat)` |
| `firstDayOfWeek` | `GetWeekStartDay()` |
| `localCountryPhoneCode` | `GetProfile('LOCAL_PHONE_COUNTRY')` |
| `currencyDecimal`, `currencySeparator` | `GetDispCurrencyDecimal()`, `GetDispCurrencySeparator()` |
| `numberDecimal`, `numberSeparator` | `GetDispNumberDecimal()`, `GetDispNumberSeparator()` |
| `months`, `shortMonths` | `GetMonth(1..12, false / true)` |
| `weekDays`, `weekDays3`, `weekDays1` | `GetDayOfWeek(0..6, 0 / 1 / 2)` |
