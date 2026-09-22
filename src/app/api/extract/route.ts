import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ExtractionSchema } from '@/lib/extraction-schema';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.7-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

function buildSystemPrompt(jsonSchema: unknown): string {
  return (
    'You extract structured facts from a free-text description and/or an attached image (e.g. a photo of a handwritten ' +
    'complaint, an ID card, or the scene) of a police incident (for a Suo Mottu FIR in Kerala, India) ' +
    'to help pre-fill a First Information Report form. This is a Suo Mottu FIR, meaning the reporting police officer is ' +
    'the complainant/informant - do not extract or invent a separate complainant identity from the text. Only include ' +
    'information that is stated or strongly implied in the text or image. Leave a field as an empty string (or an empty ' +
    'array for lists) when the information is not present - never invent names, dates, ages, or addresses. Dates must be ' +
    'YYYY-MM-DD and times HH:MM (24-hour). The narrative field should be a clean, formal police-report-style paragraph ' +
    'summarizing the incident based on the input text.\n\n' +
    'Respond with ONLY a single raw JSON object matching this JSON Schema - no markdown code fences, no explanation, ' +
    'no text before or after the JSON:\n\n' +
    JSON.stringify(jsonSchema)
  );
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Finds every balanced top-level JSON object in text (tolerating leading/trailing prose,
 * and any stray braces mentioned before the real answer) and returns the largest one -
 * the full schema object is expected to be far bigger than any incidental fragment.
 */
function extractJsonObject(text: string): string | null {
  const candidates: string[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '{') {
      i++;
      continue;
    }
    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end === -1) break; // unbalanced from here on - stop scanning
    candidates.push(text.slice(start, end + 1));
    i = end + 1;
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((largest, c) => (c.length > largest.length ? c : largest));
}

export async function POST(req: NextRequest) {
  let description: string;
  let imageDataUrl: string | undefined;
  try {
    const body = await req.json();
    description = typeof body.description === 'string' ? body.description.trim() : '';
    imageDataUrl = typeof body.image === 'string' && body.image ? body.image : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!description && !imageDataUrl) {
    return NextResponse.json({ error: 'description or image is required.' }, { status: 400 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not set. Add it to .env.local.' },
      { status: 500 }
    );
  }

  const jsonSchema = z.toJSONSchema(ExtractionSchema, { target: 'draft-7' });

  const userContent: Array<Record<string, unknown>> = [];
  if (description) userContent.push({ type: 'text', text: description });
  if (imageDataUrl) userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } });

  let completionResponse: Response;
  try {
    completionResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(jsonSchema) },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'text',
        },
        max_tokens: 4096,
        temperature: 0.1,
        reasoning: { effort: 'low' },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter. Check your network connection.' },
      { status: 502 }
    );
  }

  if (!completionResponse.ok) {
    const text = await completionResponse.text().catch(() => '');
    return NextResponse.json(
      { error: `OpenRouter request failed (${completionResponse.status}): ${text || completionResponse.statusText}` },
      { status: 502 }
    );
  }

  const completion = await completionResponse.json();
  const content = completion?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'OpenRouter returned an empty response.' }, { status: 502 });
  }

  const candidate = extractJsonObject(stripCodeFence(content));
  if (!candidate) {
    console.error('No JSON object found in model response:', content);
    return NextResponse.json({ error: 'Model response was not valid JSON.' }, { status: 502 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (err) {
    console.error('JSON.parse failed on extracted candidate:', candidate, err);
    return NextResponse.json({ error: 'Model response was not valid JSON.' }, { status: 502 });
  }

  // Some local models emit null instead of an empty string for unknown fields.
  if (parsedJson && typeof parsedJson === 'object') {
    for (const [key, value] of Object.entries(parsedJson as Record<string, unknown>)) {
      if (value === null) (parsedJson as Record<string, unknown>)[key] = '';
    }
  }

  const result = ExtractionSchema.safeParse(parsedJson);
  if (!result.success) {
    console.error('Extraction schema validation failed', result.error, 'raw:', candidate);
    return NextResponse.json({ error: 'Could not parse a structured result from the description.' }, { status: 502 });
  }

  return NextResponse.json({ data: result.data });
}
