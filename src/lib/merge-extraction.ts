import { ExtractionResult } from './extraction-schema';
import { EMPTY_FIR_FORM, FirFormData } from './types';

function isBlank(v: string): boolean {
  return !v || !v.trim();
}

// Human-readable labels for extraction-schema fields, used to ask the officer
// for anything the AI could not fill in from their description/image/audio.
export const EXTRACTION_FIELD_LABELS: Record<string, string> = {
  district: 'district',
  ps: 'police station',
  occDay: 'day of occurrence',
  narrative: 'incident narrative',
};

/**
 * Extraction-schema scalar fields that are still blank on the merged form data,
 * in human-readable form - used to ask the officer for anything the AI could
 * not fill in. Table fields (accused/acts/property) are intentionally excluded
 * since an empty table isn't necessarily missing information.
 */
export function missingExtractionFields(merged: FirFormData): string[] {
  const missing = Object.entries(EXTRACTION_FIELD_LABELS)
    .filter(([field]) => isBlank(merged[field as keyof FirFormData] as string))
    .map(([, label]) => label);

  // The complainant is the reporting officer (Suo Mottu) - their details come
  // from the Investigating Officer section, not from AI extraction.
  if (isBlank(merged.ioName)) missing.push("your name, rank, PEN and mobile number in the Investigating Officer section");

  if (merged.occurrenceTable.length === 0) missing.push('occurrence date/time');
  if (!merged.occurrenceTable.some((row) => !isBlank(row.address ?? ''))) missing.push('place of occurrence');

  return missing;
}

// Fields whose EMPTY_FIR_FORM value is a preset default rather than officer-entered
// data, so AI extraction is allowed to replace it (an actual manual edit will no
// longer equal the preset and will therefore be left alone).
const OVERRIDABLE_DEFAULTS: Partial<Record<keyof FirFormData, string>> = {
  district: EMPTY_FIR_FORM.district,
};

function isOverridable(field: keyof FirFormData, currentVal: string): boolean {
  const presetDefault = OVERRIDABLE_DEFAULTS[field];
  return isBlank(currentVal) || (presetDefault !== undefined && currentVal === presetDefault);
}

/**
 * Merges AI-extracted fields into existing form data, only filling fields
 * that are currently empty. Never overwrites data the officer already typed.
 */
export function mergeExtraction(current: FirFormData, extracted: ExtractionResult): FirFormData {
  const next: FirFormData = { ...current };

  const scalarFields: (keyof ExtractionResult & keyof FirFormData)[] = [
    'district',
    'ps',
    'occDay',
    'delayReason',
    'narrative',
  ];

  for (const field of scalarFields) {
    const currentVal = current[field] as string;
    const extractedVal = extracted[field] as string;
    if (isOverridable(field, currentVal) && !isBlank(extractedVal)) {
      (next[field] as string) = extractedVal;
    }
  }

  if (
    current.occurrenceTable.length === 0 &&
    (!isBlank(extracted.occDateFrom) || !isBlank(extracted.direction) || !isBlank(extracted.location))
  ) {
    const dateTo = isBlank(extracted.occDateTo) ? extracted.occDateFrom : extracted.occDateTo;
    const timeTo = isBlank(extracted.occTimeTo) ? extracted.occTimeFrom : extracted.occTimeTo;
    const [directionFromPs, distanceFromPs] = extracted.direction.split(',').map((s) => s.trim());
    next.occurrenceTable = [
      {
        dateFrom: extracted.occDateFrom,
        timeFrom: extracted.occTimeFrom,
        dateTo,
        timeTo,
        directionFromPs: directionFromPs || '',
        distanceFromPs: distanceFromPs || '',
        beatNo: '',
        address: extracted.location,
        coordinates: '',
        outPs: '',
        outDistrict: '',
        outState: '',
      },
    ];
  }

  if (current.accusedTable.length === 0 && extracted.accusedTable.length > 0) {
    next.accusedTable = extracted.accusedTable.map((row) => ({
      ...row,
      accusedType: isBlank(row.name) || row.name.trim().toLowerCase() === 'unknown' ? 'unknown' : 'known',
      name: isBlank(row.name) ? 'Unknown' : row.name,
      nationality: isBlank(row.nationality) ? 'India' : row.nationality,
    }));
  }
  if (current.actsTable.length === 0 && extracted.actsTable.length > 0) {
    next.actsTable = extracted.actsTable;
  }
  if (current.propertyTable.length === 0 && extracted.propertyTable.length > 0) {
    next.propertyTable = extracted.propertyTable;
  }

  return next;
}
