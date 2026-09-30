import { FirFormData } from './types';

const DRAFT_KEY = 'suoMottuFirDraft';

export interface DraftEnvelope {
  data: FirFormData;
  savedAt: string;
}

export interface SaveDraftResult {
  savedAt: string | null;
  // true when saving failed specifically because the draft (likely due to attached
  // photos) exceeded the browser's localStorage quota, so the caller can show a
  // targeted warning instead of a generic failure message.
  quotaExceeded: boolean;
}

export function saveDraft(data: FirFormData): SaveDraftResult {
  try {
    const savedAt = new Date().toISOString();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, savedAt }));
    return { savedAt, quotaExceeded: false };
  } catch (e) {
    console.warn('Could not save draft', e);
    const isQuotaError =
      e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    return { savedAt: null, quotaExceeded: isQuotaError };
  }
}

export function loadDraft(): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftEnvelope;
  } catch (e) {
    console.warn('Could not load draft', e);
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.warn('Could not clear draft', e);
  }
}
