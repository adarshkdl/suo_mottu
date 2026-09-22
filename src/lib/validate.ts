import { FirFormData, REQUIRED_FIELD_IDS, RequiredFieldId } from './types';

export function validateForm(data: FirFormData): RequiredFieldId[] {
  return REQUIRED_FIELD_IDS.filter((id) => !data[id] || !String(data[id]).trim());
}

export function hasOccurrenceAddress(data: FirFormData): boolean {
  return data.occurrenceTable.some((row) => (row.address ?? '').trim().length > 0);
}

export function accusedMissingGender(data: FirFormData): boolean {
  return data.accusedTable.some((row) => !(row.gender ?? '').trim());
}

export function victimMissingGender(data: FirFormData): boolean {
  return data.victimTable.some((row) => !(row.gender ?? '').trim());
}
