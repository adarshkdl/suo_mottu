import { FirFormData } from './types';

const DRAFT_KEY = 'suoMottuFirDraft';

export interface DraftEnvelope {
  data: FirFormData;
  savedAt: string;
}

export function saveDraft(data: FirFormData): string | null {
  try {
    const savedAt = new Date().toISOString();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, savedAt }));
    return savedAt;
  } catch (e) {
    console.warn('Could not save draft', e);
    return null;
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
