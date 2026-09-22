import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.7-flash';
const OPENROUTER_AUDIO_MODEL = process.env.OPENROUTER_AUDIO_MODEL || 'openai/whisper-large-v3-turbo';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

function dataUrlToBase64(dataUrl: string): { base64: string; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) return { base64: dataUrl, mime: 'application/octet-stream' };
  return { mime: match[1], base64: match[2] };
}

function audioFormatFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a';
  return 'wav';
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

    let transcriptionResponse: Response;
    try {
      transcriptionResponse = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENROUTER_AUDIO_MODEL,
          input_audio: { data: base64, format: audioFormatFromMime(mime) },
          response_format: 'json',
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
      console.error('OpenRouter transcription failed', transcriptionResponse.status, errText, 'audio format sent:', audioFormatFromMime(mime), 'mime:', mime, 'bytes:', base64.length);
      return NextResponse.json(
        { error: `OpenRouter transcription failed (${transcriptionResponse.status}): ${errText || transcriptionResponse.statusText}` },
        { status: 502 }
      );
    }

    const transcription = await transcriptionResponse.json();
    const text = typeof transcription?.text === 'string' ? transcription.text.trim() : '';

    if (!text) {
      console.error('Transcription response had no usable text:', JSON.stringify(transcription));
      return NextResponse.json({ error: 'OpenRouter returned an empty transcription.' }, { status: 502 });
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
