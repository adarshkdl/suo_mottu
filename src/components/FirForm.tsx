'use client';

import { useEffect, useRef, useState } from 'react';
import Field from './Field';
import RepeatTable from './RepeatTable';
import OccurrenceEditor from './OccurrenceEditor';
import AccusedEditor from './AccusedEditor';
import VictimEditor from './VictimEditor';
import PrintPreview from './PrintPreview';
import AiChatWidget from './AiChatWidget';
import {
  EMPTY_FIR_FORM,
  FirFormData,
  RequiredFieldId,
  EMPTY_OCCURRENCE_ROW,
  EMPTY_ACCUSED_ROW,
  EMPTY_VICTIM_ROW,
  EMPTY_ACT_ROW,
  EMPTY_ID_ROW,
  EMPTY_ADDRESS_ROW,
  EMPTY_PROPERTY_ROW,
} from '@/lib/types';
import { loadDraft, saveDraft, clearDraft } from '@/lib/storage';
import { validateForm, hasOccurrenceAddress, accusedMissingGender, victimMissingGender } from '@/lib/validate';
import {
  mergeExtraction,
  missingExtractionFields,
  missingOptionalSections,
  OPTIONAL_SECTION_LABELS,
  OptionalSectionId,
} from '@/lib/merge-extraction';
import { ExtractionResult } from '@/lib/extraction-schema';

function useDebouncedEffect(effect: () => void, deps: unknown[], delay: number) {
  useEffect(() => {
    const handle = setTimeout(effect, delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Backfills any keys missing from a row saved before those keys existed
// (e.g. an older draft's accused rows predating the "gender" field).
function backfillRows<T extends object>(rows: T[], emptyRow: T): T[] {
  return rows.map((row) => ({ ...emptyRow, ...row }));
}

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeekFromDateStr(dateStr: string): string {
  // Parse as a local date (not UTC) to avoid off-by-one-day errors.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

function paharFromTimeStr(timeStr: string): string {
  const [h] = timeStr.split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return '';
  const pahar = Math.floor(h / 3) + 1;
  return `Pahar ${pahar}`;
}

// Logged-in officer's profile - shown in the header and used to pre-fill the
// Investigating Officer section (only where those fields are still blank).
const OFFICER_PROFILE = {
  name: 'Saahil Guptha',
  rank: 'Sub Inspector',
  pen: '415263',
  unit: 'Museum',
  mobile: '7744885599',
  dob: new Date(1992, 7, 12), // 12/08/1992
  fatherName: 'Sukumaran',
  district: 'Thiruvananthapuram City',
  address: 'Bhargavi Nilayam, Valiyavenkadu, Charipparambu PO, Kollam',
  idType: 'Voter ID',
  idNumber: 'XIL001245',
  gender: 'Male',
};

function withOfficerProfileDefaults(form: FirFormData): FirFormData {
  const now = new Date();
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dob = OFFICER_PROFILE.dob;
  const dobIso = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
  return {
    ...form,
    firYear: form.firYear?.trim() ? form.firYear : String(now.getFullYear()),
    firDate: form.firDate?.trim() ? form.firDate : isoDate,
    firTime: form.firTime?.trim() ? form.firTime : hhmm,
    district: form.district?.trim() ? form.district : OFFICER_PROFILE.district,
    ps: form.ps?.trim() ? form.ps : OFFICER_PROFILE.unit,
    ioName: form.ioName?.trim() ? form.ioName : OFFICER_PROFILE.name,
    ioRank: form.ioRank?.trim() ? form.ioRank : OFFICER_PROFILE.rank,
    ioPen: form.ioPen?.trim() ? form.ioPen : OFFICER_PROFILE.pen,
    ioMobile: form.ioMobile?.trim() ? form.ioMobile : OFFICER_PROFILE.mobile,
    ioAge: form.ioAge?.trim() ? form.ioAge : String(ageFromDob(OFFICER_PROFILE.dob)),
    compRelativeName: form.compRelativeName?.trim() ? form.compRelativeName : OFFICER_PROFILE.fatherName,
    compGender: form.compGender?.trim() ? form.compGender : OFFICER_PROFILE.gender,
    compDob: form.compDob?.trim() ? form.compDob : dobIso,
    addressTable:
      form.addressTable.length > 0
        ? form.addressTable
        : [
            { addressType: 'Present', address: OFFICER_PROFILE.address },
            { addressType: 'Permanent', address: OFFICER_PROFILE.address },
          ],
    idTable:
      form.idTable.length > 0
        ? form.idTable
        : [{ idType: OFFICER_PROFILE.idType, idNumber: OFFICER_PROFILE.idNumber }],
  };
}

export default function FirForm() {
  const [data, setData] = useState<FirFormData>(() => withOfficerProfileDefaults(EMPTY_FIR_FORM));
  const [invalidFields, setInvalidFields] = useState<Set<RequiredFieldId>>(new Set());
  const [draftStatus, setDraftStatus] = useState('No draft saved');
  const [progress, setProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hydrated = useRef(false);
  const fieldRefs = useRef<Partial<Record<RequiredFieldId, HTMLElement | null>>>({});

  // Hydrate from localStorage on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // Backfill any keys missing from an older saved draft (e.g. fields added since).
      let migrated: FirFormData = { ...EMPTY_FIR_FORM, ...draft.data };
      migrated.occurrenceTable = backfillRows(migrated.occurrenceTable, EMPTY_OCCURRENCE_ROW);
      migrated.accusedTable = backfillRows(migrated.accusedTable, EMPTY_ACCUSED_ROW);
      migrated.victimTable = backfillRows(migrated.victimTable, EMPTY_VICTIM_ROW);
      migrated.actsTable = backfillRows(migrated.actsTable, EMPTY_ACT_ROW);
      migrated.idTable = backfillRows(migrated.idTable, EMPTY_ID_ROW);
      migrated.addressTable = backfillRows(migrated.addressTable, EMPTY_ADDRESS_ROW);
      migrated.propertyTable = backfillRows(migrated.propertyTable, EMPTY_PROPERTY_ROW);

      // Migrate the old form-wide geoFromImage field (removed) into the first
      // occurrence row's coordinates, if it had a value and coordinates is blank.
      const staleGeo = (draft.data as Partial<Record<'geoFromImage', string>>).geoFromImage;
      if (staleGeo?.trim() && migrated.occurrenceTable.length > 0 && !migrated.occurrenceTable[0].coordinates?.trim()) {
        migrated = {
          ...migrated,
          occurrenceTable: migrated.occurrenceTable.map((row, i) =>
            i === 0 ? { ...row, coordinates: staleGeo } : row
          ),
        };
      }

      setData(withOfficerProfileDefaults(migrated));
      setDraftStatus(`Draft saved at ${new Date(draft.savedAt).toLocaleTimeString()}`);
    }
    hydrated.current = true;
  }, []);

  // Autosave (debounced)
  useDebouncedEffect(
    () => {
      if (!hydrated.current) return;
      const savedAt = saveDraft(data);
      if (savedAt) {
        setDraftStatus(`Draft saved at ${new Date(savedAt).toLocaleTimeString()}`);
      }
    },
    [data],
    600
  );

  // Scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, pct)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const set = <K extends keyof FirFormData>(key: K, value: FirFormData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  // Auto-sum property values into totalValue unless manually overridden
  useEffect(() => {
    if (data.totalValueManualOverride) return;
    const sum = data.propertyTable.reduce((acc, row) => acc + (parseFloat(row.value) || 0), 0);
    const next = sum ? sum.toFixed(2) : '';
    if (next !== data.totalValue) {
      setData((prev) => ({ ...prev, totalValue: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.propertyTable]);

  // Suo Mottu FIRs are filed by the investigating officer as complainant -
  // mirror the I.O.'s identity into the complainant fields while they're blank.
  useEffect(() => {
    setData((prev) => {
      const next = { ...prev };
      if (!next.compName?.trim() && next.ioName?.trim()) next.compName = next.ioName;
      if (!next.compMobile?.trim() && next.ioMobile?.trim()) next.compMobile = next.ioMobile;
      if (!next.compAge?.trim() && next.ioAge?.trim()) next.compAge = next.ioAge;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ioName, data.ioMobile, data.ioAge]);

  // Derive day-of-week from the first occurrence period's start date, and the
  // Pahar time period from its start time, while those fields are blank.
  // Also default "Information Received at P.S" day to the occurrence date.
  const firstOccurrence = data.occurrenceTable[0];
  useEffect(() => {
    setData((prev) => {
      const first = prev.occurrenceTable[0];
      if (!first) return prev;
      const next = { ...prev };
      if (!next.occDay?.trim() && first.dateFrom?.trim()) {
        next.occDay = dayOfWeekFromDateStr(first.dateFrom);
      }
      if (!next.occPeriod?.trim() && first.timeFrom?.trim()) {
        next.occPeriod = paharFromTimeStr(first.timeFrom);
      }
      if (!next.infoDay?.trim() && first.dateFrom?.trim()) {
        next.infoDay = first.dateFrom;
      }
      if (!next.infoTime?.trim() && first.timeTo?.trim()) {
        next.infoTime = first.timeTo;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstOccurrence?.dateFrom, firstOccurrence?.timeFrom, firstOccurrence?.timeTo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = validateForm(data);
    setInvalidFields(new Set(missing));
    if (missing.length > 0) {
      const first = fieldRefs.current[missing[0]];
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first?.focus();
      alert('Please fill in all required fields (marked with *).');
      return;
    }
    if (!hasOccurrenceAddress(data)) {
      alert('Please provide an address for at least one occurrence period.');
      return;
    }
    if (accusedMissingGender(data)) {
      alert('Please provide gender for every accused person.');
      return;
    }
    if (victimMissingGender(data)) {
      alert('Please provide gender for every victim.');
      return;
    }
    setPreviewOpen(true);
  };

  const handleSaveFromPreview = () => {
    const savedAt = saveDraft(data);
    if (savedAt) setDraftStatus(`Draft saved at ${new Date(savedAt).toLocaleTimeString()}`);
    alert('Draft saved.');
  };

  const handleClear = () => {
    if (confirm('Clear all form data? This cannot be undone.')) {
      clearDraft();
      setData(withOfficerProfileDefaults(EMPTY_FIR_FORM));
      setInvalidFields(new Set());
      setDraftStatus('No draft saved');
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suo_mottu_fir_${data.firNo || 'draft'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExtracted = (
    extracted: ExtractionResult,
    confirmedEmptySections: ReadonlySet<OptionalSectionId>
  ): { filledCount: number; missingFields: string[]; pendingSections: { id: OptionalSectionId; label: string }[] } => {
    const merged = mergeExtraction(data, extracted);
    // occDay is normally derived later by the useEffect below (from the first
    // occurrence row's date), but that only fires after this render commits - derive
    // it here too so a freshly-extracted occurrence date isn't reported as missing.
    if (!merged.occDay?.trim() && merged.occurrenceTable[0]?.dateFrom?.trim()) {
      merged.occDay = dayOfWeekFromDateStr(merged.occurrenceTable[0].dateFrom);
    }
    const filledCount = Object.keys(merged).filter(
      (key) => JSON.stringify(merged[key as keyof FirFormData]) !== JSON.stringify(data[key as keyof FirFormData])
    ).length;
    setData(merged);
    const pendingSections = missingOptionalSections(merged, confirmedEmptySections).map((id) => ({
      id,
      label: OPTIONAL_SECTION_LABELS[id],
    }));
    return { filledCount, missingFields: missingExtractionFields(merged), pendingSections };
  };

  // Re-checks which optional sections are still empty and unconfirmed, without running
  // a fresh AI extraction - used when the officer just answers "none/not applicable"
  // for a pending section and there's nothing new to extract from that reply.
  const checkPendingSections = (
    confirmedEmptySections: ReadonlySet<OptionalSectionId>
  ): { id: OptionalSectionId; label: string }[] =>
    missingOptionalSections(data, confirmedEmptySections).map((id) => ({
      id,
      label: OPTIONAL_SECTION_LABELS[id],
    }));

  const handleCoordinatesExtracted = (coordinates: string): boolean => {
    let filled = false;
    setData((prev) => {
      if (prev.occurrenceTable.length === 0) {
        filled = true;
        return {
          ...prev,
          occurrenceTable: [{ ...EMPTY_OCCURRENCE_ROW, coordinates }],
        };
      }
      const first = prev.occurrenceTable[0];
      if (first.coordinates?.trim()) return prev;
      filled = true;
      return {
        ...prev,
        occurrenceTable: prev.occurrenceTable.map((row, i) => (i === 0 ? { ...row, coordinates } : row)),
      };
    });
    return filled;
  };

  const isInvalid = (id: RequiredFieldId) => invalidFields.has(id);

  return (
    <>
      <div className="bg-decor" aria-hidden="true" />

      <header className="app-header no-print">
        <div className="header-inner">
          <div className="header-title">
            <div className="brand-badge">FIR</div>
            <div>
              <h1>
                Suo Mottu FIR Registration{' '}
                <span className="mal">സ്വമേധയാ പ്രഥമ വിവര റിപ്പോർട്ട്</span>
              </h1>
              <p className="subtitle">CCTNS-R-IIF-1 &middot; Under Section 173 BNSS</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="draft-status">
              <span className="dot" />
              {draftStatus}
            </span>
            <button type="button" className="btn btn-ghost" onClick={handleClear}>
              Clear
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleExport} hidden>
              Export JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={handlePrint} hidden>
              Print / Preview
            </button>
            <div className="profile-chip">
              <span className="profile-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                </svg>
              </span>
              <div className="profile-details">
                <span className="profile-name">{OFFICER_PROFILE.name}</span>
                <span className="profile-meta">{OFFICER_PROFILE.rank} &middot; PEN {OFFICER_PROFILE.pen}</span>
                <span className="profile-unit">{OFFICER_PROFILE.unit} &middot; {OFFICER_PROFILE.district}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="progress-bar no-print">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="page">
        <form onSubmit={handleSubmit} noValidate>
          {/* 1. Header - hidden: district/ps/date/time are auto-filled from the officer profile and current time; review in Preview instead */}
          <section className="card" data-icon="🗂️" hidden>
            <h2>
              <span className="step-num">1</span> Fir Information{' '}
              <span className="mal">പ്രഥമ വിവര വിശദാംശം</span>
            </h2>
            <div className="grid grid-4">
              <Field
                id="district"
                label="District"
                mal="ജില്ല"
                required
                invalid={isInvalid('district')}
                value={data.district}
                onValueChange={(v) => set('district', v)}
                ref={(el) => { fieldRefs.current.district = el; }}
              />
              <Field
                id="ps"
                label="Police Station"
                mal="പോലീസ് സ്റ്റേഷൻ"
                required
                invalid={isInvalid('ps')}
                value={data.ps}
                onValueChange={(v) => set('ps', v)}
                ref={(el) => { fieldRefs.current.ps = el; }}
              />
              <Field
                id="firNo"
                label="FIR No"
                mal="പ്രഥമ വിവര നമ്പർ"
                value={data.firNo}
                onValueChange={(v) => set('firNo', v)}
                fieldHidden
              />
              <Field
                id="firYear"
                label="Year"
                mal="വർഷം"
                type="number"
                min={2000}
                max={2100}
                value={data.firYear}
                onValueChange={(v) => set('firYear', v)}
                fieldHidden
              />
              <Field
                id="firDate"
                label="Date of FIR"
                mal="തീയതി"
                type="date"
                required
                invalid={isInvalid('firDate')}
                value={data.firDate}
                onValueChange={(v) => set('firDate', v)}
                ref={(el) => { fieldRefs.current.firDate = el; }}
              />
              <Field
                id="firTime"
                label="Time of FIR"
                mal="സമയം"
                type="time"
                required
                invalid={isInvalid('firTime')}
                value={data.firTime}
                onValueChange={(v) => set('firTime', v)}
                ref={(el) => { fieldRefs.current.firTime = el; }}
              />
            </div>
          </section>

          {/* 1. Occurrence */}
          <section className="card" data-icon="⏱️">
            <h2>
              <span className="step-num">1</span> Occurrence of Offence{' '}
              <span className="mal">കുറ്റകൃത്യം സംഭവിച്ചത്</span>
            </h2>
            <div className="highlight-panel">
              <h3>
                Information Received at P.S <span className="mal">പോലീസ് സ്റ്റേഷനിൽ വിവരം ലഭിച്ചത്</span>
              </h3>
              <div className="grid grid-4">
                <Field
                  id="infoDay"
                  label="Day"
                  mal="ദിവസം"
                  type="date"
                  value={data.infoDay}
                  onValueChange={(v) => set('infoDay', v)}
                />
                <Field
                  id="infoTime"
                  label="Time"
                  mal="സമയം"
                  type="time"
                  value={data.infoTime}
                  onValueChange={(v) => set('infoTime', v)}
                />
                <Field
                  id="gdEntryNo"
                  label="GD Entry No"
                  mal="ജനറൽ ഡയറി നമ്പർ"
                  value={data.gdEntryNo}
                  onValueChange={(v) => set('gdEntryNo', v)}
                />
                <Field
                  id="gdTime"
                  label="GD Time"
                  mal="സമയം"
                  type="time"
                  value={data.gdTime}
                  onValueChange={(v) => set('gdTime', v)}
                />
              </div>
              <Field
                id="delayReason"
                label="Reason for Delay in Reporting"
                mal="കാലതാമസം വരുത്തിയതിനുള്ള കാരണം"
                as="textarea"
                rows={2}
                value={data.delayReason}
                onValueChange={(v) => set('delayReason', v)}
              />
            </div>

            <div className="grid grid-4">
              <Field id="occDay" label="Day" mal="ദിവസം" value={data.occDay} onValueChange={(v) => set('occDay', v)} fieldHidden />
              <Field
                id="occPeriod"
                label="Time Period"
                mal="സമയം (പഹർ)"
                placeholder="e.g. Pahar1"
                value={data.occPeriod}
                onValueChange={(v) => set('occPeriod', v)}
                fieldHidden
              />
            </div>
            <OccurrenceEditor rows={data.occurrenceTable} onChange={(rows) => set('occurrenceTable', rows)} />

            {/* 4. Type of Information - hidden: always defaults to Suo Mottu, no need to show/edit */}
            <div hidden>
              <Field id="infoType" label="Type of Information" value={data.infoType} readOnly onValueChange={() => {}} />
              <Field
                id="complaintSource"
                label="Source of Complaint"
                mal="പരാതിയുടെ ഉറവിടം"
                value={data.complaintSource}
                readOnly
                onValueChange={() => {}}
              />
            </div>

          </section>

          {/* 2. Acts & Sections */}
          <section className="card" data-icon="⚖️">
            <h2>
              <span className="step-num">2</span> Acts &amp; Sections{' '}
              <span className="mal">നിയമം &amp; വകുപ്പുകൾ</span>
            </h2>
            <RepeatTable
              rows={data.actsTable}
              onChange={(rows) => set('actsTable', rows)}
              addLabel="Add Act/Section"
              emptyRow={{ act: '', section: '' }}
              columns={[
                { key: 'act', label: 'Act', placeholder: 'Act name' },
                { key: 'section', label: 'Section', placeholder: 'Section' },
              ]}
            />
          </section>

          {/* 6. Complainant / Informant - hidden: auto-filled from officer profile, review in Preview instead */}
          <section className="card" data-icon="🧑‍💼" hidden>
            <h2>
              <span className="step-num">6</span> Complainant / Informant{' '}
              <span className="mal">പരാതിക്കാരൻ / വിവരം നൽകിയ ആൾ</span>
            </h2>
            <div className="grid grid-4">
              <Field
                id="compName"
                label="Name"
                mal="പേര്"
                required
                invalid={isInvalid('compName')}
                value={data.compName}
                onValueChange={(v) => set('compName', v)}
                ref={(el) => { fieldRefs.current.compName = el; }}
              />
              <Field
                id="compRelativeName"
                label="Father's/Mother's/Husband's Name"
                mal="പിതാവിന്റെ/മാതാവിന്റെ/ഭർത്താവിന്റെ പേര്"
                value={data.compRelativeName}
                onValueChange={(v) => set('compRelativeName', v)}
              />
              <Field
                id="compAge"
                label="Age"
                mal="വയസ്സ്"
                type="number"
                min={0}
                max={120}
                value={data.compAge}
                onValueChange={(v) => set('compAge', v)}
              />
              <Field
                id="compGender"
                label="Gender"
                mal="ലിംഗം"
                required
                invalid={isInvalid('compGender')}
                value={data.compGender}
                onValueChange={(v) => set('compGender', v)}
                ref={(el) => { fieldRefs.current.compGender = el; }}
              />
              <Field
                id="compDob"
                label="Date of Birth"
                mal="ജനനതീയതി"
                type="date"
                value={data.compDob}
                onValueChange={(v) => set('compDob', v)}
              />
              <Field
                id="compNationality"
                label="Nationality"
                mal="പൗരത്വം"
                value={data.compNationality}
                onValueChange={(v) => set('compNationality', v)}
              />
              <Field
                id="compUid"
                label="UID No (Aadhar)"
                mal="ആധാർ നമ്പർ"
                value={data.compUid}
                onValueChange={(v) => set('compUid', v)}
              />
              <Field
                id="compPassport"
                label="Passport No"
                mal="പാസ്പോർട്ട് നമ്പർ"
                value={data.compPassport}
                onValueChange={(v) => set('compPassport', v)}
              />
              <Field
                id="compOccupation"
                label="Occupation"
                mal="തൊഴിൽ"
                value={data.compOccupation}
                onValueChange={(v) => set('compOccupation', v)}
              />
              <Field
                id="compLandPhone"
                label="Land Phone"
                mal="ഫോൺ നമ്പർ"
                value={data.compLandPhone}
                onValueChange={(v) => set('compLandPhone', v)}
              />
              <Field
                id="compMobile"
                label="Mobile Number"
                mal="മൊബൈൽ നമ്പർ"
                type="tel"
                value={data.compMobile}
                onValueChange={(v) => set('compMobile', v)}
              />
            </div>

            <h3>
              ID Details <span className="mal">തിരിച്ചറിയൽ രേഖകൾ</span>
            </h3>
            <RepeatTable
              rows={data.idTable}
              onChange={(rows) => set('idTable', rows)}
              addLabel="Add ID"
              emptyRow={{ idType: '', idNumber: '' }}
              columns={[
                { key: 'idType', label: 'ID Type', placeholder: 'e.g. Aadhar, Voter ID' },
                { key: 'idNumber', label: 'ID Number', placeholder: 'ID number' },
              ]}
            />

            <h3>
              Address <span className="mal">മേൽവിലാസം</span>
            </h3>
            <RepeatTable
              rows={data.addressTable}
              onChange={(rows) => set('addressTable', rows)}
              addLabel="Add Address"
              emptyRow={{ addressType: '', address: '' }}
              columns={[
                { key: 'addressType', label: 'Address Type', placeholder: 'Permanent / Present' },
                { key: 'address', label: 'Address', placeholder: 'Full address' },
              ]}
            />
          </section>

          {/* 7. Accused */}
          <section className="card" data-icon="🕵️">
            <h2>
              <span className="step-num">3</span> Accused Details{' '}
              <span className="mal">കുറ്റവാളികളെ സംബന്ധിച്ച വിശദ വിവരങ്ങൾ</span>
            </h2>
            <AccusedEditor rows={data.accusedTable} onChange={(rows) => set('accusedTable', rows)} />
          </section>

          {/* Victim */}
          <section className="card" data-icon="🧍">
            <h2>
              <span className="step-num">4</span> Victim Details{' '}
              <span className="mal">ഇരയെ സംബന്ധിച്ച വിശദ വിവരങ്ങൾ</span>
            </h2>
            <VictimEditor rows={data.victimTable} onChange={(rows) => set('victimTable', rows)} />
          </section>


          {/* 9 & 10. Property */}
          <section className="card" data-icon="💎">
            <h2>
              <span className="step-num">5</span> Properties of Interest{' '}
              <span className="mal">സ്വത്തുക്കളുടെ വിവരം</span>
            </h2>
            <RepeatTable
              rows={data.propertyTable}
              onChange={(rows) => set('propertyTable', rows)}
              addLabel="Add Property"
              emptyRow={{ propType: '', subType: '', description: '', value: '' }}
              columns={[
                { key: 'propType', label: 'Property Type', placeholder: 'Property type' },
                { key: 'subType', label: 'Sub Type', placeholder: 'Sub type' },
                { key: 'description', label: 'Description', placeholder: 'Description' },
                { key: 'value', label: 'Value (Rs)', placeholder: 'Value (Rs)', type: 'number' },
              ]}
            />

            <div className="field" style={{ maxWidth: 300, marginTop: 12 }}>
              <label htmlFor="totalValue">
                10. Total Value of Property Stolen (Rs) <span className="mal">ആകെ മൂല്യം</span>
              </label>
              <input
                id="totalValue"
                type="number"
                min={0}
                step={0.01}
                value={data.totalValue}
                onChange={(e) =>
                  setData((prev) => ({
                    ...prev,
                    totalValue: e.target.value,
                    totalValueManualOverride: true,
                  }))
                }
              />
            </div>
          </section>

          {/* 11. Inquest */}
          <section className="card" data-icon="📄" hidden>
            <h2>
              <span className="step-num">11</span> Inquest Report / U.D. Case No{' '}
              <span className="mal">പ്രേത വിചാരണ റിപ്പോർട്ട്</span>
            </h2>
            <div className="grid grid-4">
              <Field
                id="inquestType"
                label="Registration Type"
                mal="രജിസ്ട്രേഷൻ തരം"
                value={data.inquestType}
                onValueChange={(v) => set('inquestType', v)}
              />
              <Field
                id="inquestNo"
                label="Registration Number"
                mal="രജിസ്ട്രേഷൻ നമ്പർ"
                value={data.inquestNo}
                onValueChange={(v) => set('inquestNo', v)}
              />
            </div>
          </section>

          {/* 12. Narrative */}
          <section className="card" data-icon="📜">
            <h2>
              <span className="step-num">12</span> First Information Contents{' '}
              <span className="mal">എഫ്.ഐ.ആർ ഉള്ളടക്കം</span> <span className="req">*</span>
            </h2>
            <Field
              id="narrative"
              label=""
              as="textarea"
              rows={8}
              required
              invalid={isInvalid('narrative')}
              placeholder="Describe the incident in detail (English or Malayalam)..."
              value={data.narrative}
              onValueChange={(v) => set('narrative', v)}
              ref={(el) => { fieldRefs.current.narrative = el; }}
            />
          </section>

          {/* Investigating Officer */}
          <section className="card" data-icon="👮">
            <h2>
              <span className="step-num">✓</span> Investigating Officer{' '}
              <span className="mal">അന്വേഷണ ഉദ്യോഗസ്ഥൻ</span>
            </h2>
            <div className="grid grid-4">
              <Field id="ioName" label="Name of I.O" value={data.ioName} onValueChange={(v) => set('ioName', v)} />
              <Field id="ioRank" label="Rank" value={data.ioRank} onValueChange={(v) => set('ioRank', v)} />
              <Field id="ioPen" label="PEN" value={data.ioPen} onValueChange={(v) => set('ioPen', v)} />
              <Field id="ioMobile" label="Mobile" value={data.ioMobile} onValueChange={(v) => set('ioMobile', v)} />
              <Field id="ioAge" label="Age" value={data.ioAge} onValueChange={(v) => set('ioAge', v)} />
            </div>
          </section>

          <div className="form-footer no-print">
            <button type="submit" className="btn btn-primary">
              ✓ Validate &amp; Preview
            </button>
          </div>
        </form>
      </main>

      {previewOpen && (
        <div className="preview-overlay no-print">
          <div className="preview-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setPreviewOpen(false)}>
              ← Edit
            </button>
            <span className="preview-toolbar-title">FIR Preview</span>
            <div className="preview-toolbar-actions">
              <button type="button" className="btn btn-secondary" onClick={handleSaveFromPreview}>
                Save Draft
              </button>
            </div>
          </div>
          <div className="preview-scroll">
            <PrintPreview d={data} screen />
          </div>
        </div>
      )}

      <PrintPreview d={data} />
      <AiChatWidget
        onExtracted={handleExtracted}
        onCoordinatesExtracted={handleCoordinatesExtracted}
        onCheckPendingSections={checkPendingSections}
      />
    </>
  );
}
