// Seed fixtures for the mock Siebel harness: one list applet and one form applet, each with controls
// and a small record set. Shapes mirror what the bridge reads from a real PM.
import type { MockAppletDef } from 'siebel-connect/testing'

export interface Account {
  Id: string
  Name: string
  Location: string
  [field: string]: unknown
}

export interface Contact {
  Id: string
  'First Name': string
  'Last Name': string
  [field: string]: unknown
}

/** A list applet: three accounts, Name + Location columns. */
export const accountListFixture: MockAppletDef = {
  name: 'Account List Applet',
  isList: true,
  controls: {
    Name: { name: 'Name', uiType: 'Text', fieldName: 'Name', isRequired: true },
    Location: { name: 'Location', uiType: 'Text', fieldName: 'Location' },
  },
  records: [
    { Id: '1-A', Name: 'Acme', Location: 'NY' },
    { Id: '1-B', Name: 'Globex', Location: 'LA' },
    { Id: '1-C', Name: 'Initech', Location: 'SF' },
  ] satisfies Account[],
  rowListRowCount: 10,
}

/** A form applet: a single contact record, First/Last Name fields. */
export const contactFormFixture: MockAppletDef = {
  name: 'Contact Form Applet',
  isList: false,
  controls: {
    FirstName: { name: 'FirstName', uiType: 'Text', fieldName: 'First Name', isRequired: true },
    LastName: { name: 'LastName', uiType: 'Text', fieldName: 'Last Name', isRequired: true },
  },
  records: [{ Id: '2-A', 'First Name': 'Ada', 'Last Name': 'Lovelace' }] satisfies Contact[],
}

/** Both fixtures, ready to hand to `createMockSiebel({ applets })`. */
export const allApplets: MockAppletDef[] = [accountListFixture, contactFormFixture]
