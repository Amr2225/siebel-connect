// Public entry for "siebel-connect". Classes, factory, errors, and logger are
// re-exported here as later phases land. Today it surfaces the type foundation,
// the error hierarchy, and the pluggable logger.
export type * from './types'
export * from './errors'
export { configure, isDebugEnabled, type ConfigureLoggerOptions } from './logger'
export { default as Notifications, type NotificationsOptions, type FieldToControlMap } from './Notifications'
export { default as LocaleData } from './LocaleData'
export { default as BaseApplet } from './BaseApplet'
export { default as PopupApplet } from './PopupApplet'
export { default as PopupController } from './PopupController'
export { default as Applet } from './Applet'
export { init, getApplet, getPopup, clear, getAppletStore } from './factory'
export {
  createAppletStore,
  type AppletStore,
  type AppletSnapshot,
} from './applet-store'
