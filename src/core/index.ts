// Public entry for "siebel-connect". Classes, factory, errors, and logger are
// re-exported here as later phases land. Today it surfaces the type foundation,
// the error hierarchy, and the pluggable logger.
export type * from './types'
export * from './errors'
export { configure, isDebugEnabled, type ConfigureLoggerOptions } from './logger'
