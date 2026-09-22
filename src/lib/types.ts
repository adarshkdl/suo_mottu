export interface ActRow {
  act: string;
  section: string;
}
export const EMPTY_ACT_ROW: ActRow = { act: '', section: '' };

export interface IdRow {
  idType: string;
  idNumber: string;
}
export const EMPTY_ID_ROW: IdRow = { idType: '', idNumber: '' };

export interface AddressRow {
  addressType: string;
  address: string;
}
export const EMPTY_ADDRESS_ROW: AddressRow = { addressType: '', address: '' };

export interface AccusedRow {
  accusedType: 'known' | 'unknown';
  name: string;
  alias: string;
  age: string;
  gender: string;
  nationality: string;
  fatherName: string;
  tel: string;
  presentAddress: string;
  permanentAddress: string;
}
export const EMPTY_ACCUSED_ROW: AccusedRow = {
  accusedType: 'known',
  name: '',
  alias: '',
  age: '',
  gender: '',
  nationality: 'India',
  fatherName: '',
  tel: '',
  presentAddress: '',
  permanentAddress: '',
};

export interface VictimRow {
  victimType: 'known' | 'unknown';
  name: string;
  alias: string;
  age: string;
  gender: string;
  nationality: string;
  fatherName: string;
  tel: string;
  presentAddress: string;
  permanentAddress: string;
}
export const EMPTY_VICTIM_ROW: VictimRow = {
  victimType: 'known',
  name: '',
  alias: '',
  age: '',
  gender: '',
  nationality: 'India',
  fatherName: '',
  tel: '',
  presentAddress: '',
  permanentAddress: '',
};

export interface PropertyRow {
  propType: string;
  subType: string;
  description: string;
  value: string;
}
export const EMPTY_PROPERTY_ROW: PropertyRow = { propType: '', subType: '', description: '', value: '' };

export interface OccurrenceRow {
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
  directionFromPs: string;
  distanceFromPs: string;
  beatNo: string;
  address: string;
  coordinates: string;
  outPs: string;
  outDistrict: string;
  outState: string;
}
export const EMPTY_OCCURRENCE_ROW: OccurrenceRow = {
  dateFrom: '',
  timeFrom: '',
  dateTo: '',
  timeTo: '',
  directionFromPs: '',
  distanceFromPs: '',
  beatNo: '',
  address: '',
  coordinates: '',
  outPs: '',
  outDistrict: '',
  outState: '',
};

export interface FirFormData {
  // 1. Header
  district: string;
  ps: string;
  firNo: string;
  firYear: string;
  firDate: string;
  firTime: string;

  // 2. Acts & Sections
  actsTable: ActRow[];

  // 3. Occurrence
  occDay: string;
  occPeriod: string;
  occurrenceTable: OccurrenceRow[];
  infoDay: string;
  infoTime: string;
  gdEntryNo: string;
  gdTime: string;

  // 4. Type of information
  infoType: string;
  complaintSource: string;

  // 6. Complainant / informant
  compName: string;
  compRelativeName: string;
  compAge: string;
  compGender: string;
  compDob: string;
  compNationality: string;
  compUid: string;
  compPassport: string;
  compOccupation: string;
  compLandPhone: string;
  compMobile: string;
  idTable: IdRow[];
  addressTable: AddressRow[];

  // 7. Accused
  accusedTable: AccusedRow[];

  // Victim
  victimTable: VictimRow[];

  // 8. Delay reason
  delayReason: string;

  // 9 & 10. Property
  propertyTable: PropertyRow[];
  totalValue: string;
  totalValueManualOverride: boolean;

  // 11. Inquest
  inquestType: string;
  inquestNo: string;

  // 12. Narrative
  narrative: string;

  // Investigating officer
  ioName: string;
  ioRank: string;
  ioPen: string;
  ioMobile: string;
  ioAge: string;
}

export const EMPTY_FIR_FORM: FirFormData = {
  district: 'Thiruvananthapuram City',
  ps: '',
  firNo: '',
  firYear: '',
  firDate: '',
  firTime: '',

  actsTable: [],

  occDay: '',
  occPeriod: '',
  occurrenceTable: [],
  infoDay: '',
  infoTime: '',
  gdEntryNo: '',
  gdTime: '',

  infoType: 'Suo Mottu',
  complaintSource: 'Suo Mottu',

  compName: '',
  compRelativeName: '',
  compAge: '',
  compGender: '',
  compDob: '',
  compNationality: 'INDIA',
  compUid: '',
  compPassport: '',
  compOccupation: '',
  compLandPhone: '',
  compMobile: '',
  idTable: [],
  addressTable: [],

  accusedTable: [],

  victimTable: [],

  delayReason: '',

  propertyTable: [],
  totalValue: '',
  totalValueManualOverride: false,

  inquestType: '',
  inquestNo: '',

  narrative: '',

  ioName: '',
  ioRank: '',
  ioPen: '',
  ioMobile: '',
  ioAge: '',
};

export type RequiredFieldId =
  | 'district' | 'ps' | 'firDate' | 'firTime'
  | 'compName' | 'compGender' | 'narrative';

export const REQUIRED_FIELD_IDS: RequiredFieldId[] = [
  'district', 'ps', 'firDate', 'firTime',
  'compName', 'compGender', 'narrative',
];
