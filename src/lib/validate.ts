import { FirFormData, REQUIRED_FIELD_IDS, RequiredFieldId } from './types';

// Human-readable labels for required fields, so a validation failure can name exactly
// what's missing instead of a generic "fill the required fields" message - some of
// these (district, ps, firDate, firTime, compName, compGender) live in sections that
// are hidden on screen (auto-filled from the officer profile), so naming them is the
// only way the officer can tell what's actually blocked.
export const REQUIRED_FIELD_LABELS: Record<RequiredFieldId, string> = {
  district: 'District',
  ps: 'Police Station',
  firDate: 'Date of FIR',
  firTime: 'Time of FIR',
  compName: 'Complainant Name',
  compGender: 'Complainant Gender',
  narrative: 'First Information Contents (incident narrative)',
};

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
