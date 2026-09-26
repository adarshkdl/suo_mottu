import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.7-flash';
// OpenRouter has no separate /audio/transcriptions endpoint - audio is sent as an
// input_audio content part on a normal /chat/completions call, so this must be a
// model that actually accepts audio input (e.g. a Gemini model), not a Whisper model id.
const OPENROUTER_AUDIO_MODEL = process.env.OPENROUTER_AUDIO_MODEL || 'google/gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// The mime segment of a data URL can itself contain ";" (e.g. "audio/webm;codecs=opus"
// from MediaRecorder), so match everything up to the LAST ";base64," rather than
// stopping at the first ";" - otherwise this falls through and returns the whole
// data URL (including the "data:...;base64," prefix) as if it were raw base64.
function dataUrlToBase64(dataUrl: string): { base64: string; mime: string } {
  const match = dataUrl.match(/^data:(.+);base64,([\s\S]*)$/);
  if (!match) return { base64: dataUrl, mime: 'application/octet-stream' };
  return { mime: match[1], base64: match[2] };
}

// OpenRouter's documented input_audio formats are wav/mp3/aiff/aac/ogg/flac/m4a/pcm16/pcm24 -
// webm (the browser MediaRecorder default) isn't one of them, but providers generally sniff
// the container regardless of the declared format, so pass "webm" through as best-effort
// and fall back to "ogg" (webm and ogg share the same underlying Matroska/Opus family).
function audioFormatFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';
  return 'wav';
}

// Best-effort cleanup for when the model ignores the "English only" instruction and
// still emits a labelled original-language transcript alongside the translation (e.g.
// "Malayalam: ... \n\nEnglish: ..."). Keeps only the text after the last recognized
// label, so the composer only ever receives the final English sentence.
const TRANSLATION_LABEL_RE = /(?:^|\n)\s*(?:english(?:\s+translation)?|translation)\s*:\s*/gi;
function stripToFinalTranslation(text: string): string {
  const matches = [...text.matchAll(TRANSLATION_LABEL_RE)];
  if (matches.length === 0) return text.trim();
  const last = matches[matches.length - 1];
  return text.slice(last.index! + last[0].length).trim();
}

// Backstop for the classic hallucination failure mode on silent/near-silent audio:
// the model latches onto a short phrase and repeats it many times in a row instead of
// recognizing there was no real speech. Collapses any word n-gram that repeats 3+ times
// in immediate succession down to a single occurrence. Word-based (not regex \b, which
// doesn't understand Malayalam/other non-ASCII scripts) so this works for any language.
function collapseRepeatedPhrasesOnce(text: string): { text: string; changed: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 6) return { text: text.trim(), changed: false };

  const result: string[] = [];
  let i = 0;
  let changed = false;
  const maxPhraseLen = Math.min(15, Math.floor(words.length / 3));
  while (i < words.length) {
    let collapsedHere = false;
    // Try the SHORTEST phrase length first so we find the true atomic repeating unit
    // (e.g. a 6-word phrase) rather than a multiple of it (e.g. 12 words = two copies
    // of the 6-word phrase) being mistaken for a single repeated phrase.
    for (let len = 2; len <= maxPhraseLen && i + len * 3 <= words.length; len++) {
      const phrase = words.slice(i, i + len).join(' ');
      let repeats = 1;
      while (words.slice(i + repeats * len, i + (repeats + 1) * len).join(' ') === phrase) {
        repeats++;
      }
      if (repeats >= 3) {
        result.push(phrase);
        i += repeats * len;
        collapsedHere = true;
        changed = true;
        break;
      }
    }
    if (!collapsedHere) {
      result.push(words[i]);
      i++;
    }
  }
  return { text: result.join(' ').trim(), changed };
}

function collapseRepeatedPhrases(text: string): string {
  let current = text;
  // Re-run until stable: collapsing an outer repeat can reveal a further inner one
  // (e.g. a repeated pair of sentences, each of which was itself a repeated phrase).
  for (let pass = 0; pass < 5; pass++) {
    const { text: next, changed } = collapseRepeatedPhrasesOnce(current);
    current = next;
    if (!changed) break;
  }
  return current;
}

// Some providers return message.content as a string, others as an array of
// content parts (e.g. [{ type: 'text', text: '...' }]) - normalize to a string.
function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
      .trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  let imageDataUrl: string | undefined;
  let audioDataUrl: string | undefined;
  try {
    const body = await req.json();
    imageDataUrl = typeof body.image === 'string' && body.image ? body.image : undefined;
    audioDataUrl = typeof body.audio === 'string' && body.audio ? body.audio : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!imageDataUrl && !audioDataUrl) {
    return NextResponse.json({ error: 'image or audio is required.' }, { status: 400 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not set. Add it to .env.local.' },
      { status: 500 }
    );
  }

  if (audioDataUrl) {
    const { base64, mime } = dataUrlToBase64(audioDataUrl);
    const audioFormat = audioFormatFromMime(mime);

    const audioContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          'Listen to the speech in this audio clip and transcribe it EXACTLY in the same language the speaker used - ' +
          'do not translate it into English or any other language. If they spoke Malayalam, output Malayalam script; ' +
          'if they spoke English, output English; whatever language it is, transcribe in that same language and script. ' +
          'Output ONLY the transcription as plain prose suitable for a police FIR report - never a translation, never ' +
          'both the original and a translated version, never the same sentence repeated in more than one language, no ' +
          'labels like "Transcription:" or "Translation:", no markdown, no commentary. Just the one transcribed ' +
          'sentence/paragraph in its original language. If the audio has no discernible speech, respond with an empty string.',
      },
      { type: 'input_audio', input_audio: { data: base64, format: audioFormat } },
    ];

    let transcriptionResponse: Response;
    try {
      transcriptionResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENROUTER_AUDIO_MODEL,
          messages: [{ role: 'user', content: audioContent }],
          max_tokens: 1024,
          temperature: 0.1,
        }),
      });
    } catch {
      return NextResponse.json(
        { error: 'Could not reach OpenRouter. Check your network connection.' },
        { status: 502 }
      );
    }

    if (!transcriptionResponse.ok) {
      const errText = await transcriptionResponse.text().catch(() => '');
      console.error('OpenRouter transcription failed', transcriptionResponse.status, errText, 'audio format sent:', audioFormat, 'mime:', mime, 'bytes:', base64.length);
      return NextResponse.json(
        { error: `OpenRouter transcription failed (${transcriptionResponse.status}): ${errText || transcriptionResponse.statusText}` },
        { status: 502 }
      );
    }

    const completion = await transcriptionResponse.json();
    const rawText = messageContentToText(completion?.choices?.[0]?.message?.content);
    const text = collapseRepeatedPhrases(stripToFinalTranslation(rawText));

    if (!text) {
      // Empty is a valid outcome for a silent/near-silent segment - not an error.
      return NextResponse.json({ text: '' });
    }

    return NextResponse.json({ text });
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text:
        'Describe this image in plain text for a police FIR report, focused on any incident-relevant details visible ' +
        '(people, property, damage, location, signage, text/documents visible). Write it as a short paragraph a police ' +
        'officer could paste directly into an incident description. Do not use markdown or JSON - plain prose only.',
    },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ];

  let completionResponse: Response;
  try {
    completionResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_VISION_MODEL,
        messages: [{ role: 'user', content }],
        max_tokens: 2048,
        temperature: 0.2,
        reasoning: { effort: 'none' },
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
  const choice = completion?.choices?.[0];
  const text = messageContentToText(choice?.message?.content);

  if (!text) {
    console.error('Image description response had no usable text:', JSON.stringify(completion));
    const reason =
      choice?.finish_reason === 'length'
        ? 'The model ran out of tokens before producing a description. Try again.'
        : 'OpenRouter returned an empty response.';
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  return NextResponse.json({ text });
}
