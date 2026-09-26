'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ExtractionResult } from '@/lib/extraction-schema';
import { readGpsFromJpeg, formatCoords } from '@/lib/exif';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface AiChatWidgetProps {
  onExtracted: (data: ExtractionResult) => { filledCount: number; missingFields: string[] };
  onCoordinatesExtracted?: (coordinates: string) => boolean;
}

export default function AiChatWidget({ onExtracted, onCoordinatesExtracted }: AiChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingForSegmentRef = useRef(false);

  // Simple voice-activity detection so silent segments never reach the transcription
  // API - without this, the model tends to hallucinate a runaway repeated phrase when
  // fed near-silent audio instead of correctly returning "no speech".
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const segmentPeakVolumeRef = useRef(0);
  const SPEECH_RMS_THRESHOLD = 0.02; // empirical: background noise sits well below this

  // How often (ms) to cut the recording into a segment and transcribe it, so the
  // composer fills in part by part instead of waiting for the whole recording.
  const SEGMENT_MS = 6000;

  const canSend = text.trim().length > 0 && !loading;
  const busy = loading || describing || recording;

  const addMessage = (role: ChatMessage['role'], msgText: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text: msgText }]);
  };

  const appendToComposer = (generated: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()}\n${generated}` : generated));
  };

  const describeMedia = async (payload: { image?: string } | { audio?: string }) => {
    setDescribing(true);
    try {
      const res = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        addMessage('assistant', body.error || 'Could not generate a description for that.');
        return;
      }
      appendToComposer(body.text as string);
    } catch {
      addMessage('assistant', 'Network error - could not reach the description service.');
    } finally {
      setDescribing(false);
    }
  };

  // Transcribes one short audio segment and appends it to the composer as soon as
  // it's ready, without touching the "describing" (image/full-clip) busy state -
  // segment transcription happens quietly in the background while recording continues.
  // A failure is logged and surfaced once in chat (not per-segment) so silence during
  // recording doesn't look like nothing is happening.
  const transcribeSegment = async (blob: Blob) => {
    if (blob.size === 0) {
      console.warn('[voice] empty segment blob, skipping');
      return;
    }
    const reader = new FileReader();
    const dataUrl: string = await new Promise<string>((resolve, reject) => {
      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject());
      reader.onerror = () => reject();
      reader.readAsDataURL(blob);
    }).catch(() => '');
    if (!dataUrl) {
      console.warn('[voice] could not read segment blob as data URL');
      return;
    }

    try {
      const res = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        console.error('[voice] segment transcription failed', res.status, body?.error);
        reportSegmentError(body?.error || `Transcription failed (${res.status}).`);
        return;
      }
      const chunkText = typeof body.text === 'string' ? body.text.trim() : '';
      if (chunkText) appendToComposer(chunkText);
    } catch (err) {
      console.error('[voice] network error transcribing segment', err);
      reportSegmentError('Network error while transcribing.');
    }
  };

  // Surfaces the first segment error of a recording session to chat, then stays quiet
  // for the rest of that session so a run of failures doesn't spam the conversation.
  const segmentErrorShownRef = useRef(false);
  const reportSegmentError = (msg: string) => {
    if (segmentErrorShownRef.current) return;
    segmentErrorShownRef.current = true;
    addMessage('assistant', `⚠️ Voice transcription issue: ${msg}`);
  };

  const handleImagePick = (file: File | undefined) => {
    if (!file) return;

    file
      .arrayBuffer()
      .then((buffer) => {
        const gps = readGpsFromJpeg(buffer);
        if (gps && onCoordinatesExtracted) {
          const filled = onCoordinatesExtracted(formatCoords(gps));
          if (filled) addMessage('assistant', `📍 Picked up GPS coordinates from the photo: ${formatCoords(gps)}`);
        }
      })
      .catch(() => {});

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        describeMedia({ image: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  // Continuously samples the mic's volume (RMS) via Web Audio and tracks the loudest
  // moment seen since the last reset, so a segment can be classified as "had speech"
  // or "silence" right before it's transcribed.
  const startVoiceActivityDetection = (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    const data = new Float32Array(analyser.fftSize);
    const sample = () => {
      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i];
      const rms = Math.sqrt(sumSquares / data.length);
      if (rms > segmentPeakVolumeRef.current) segmentPeakVolumeRef.current = rms;
      vadRafRef.current = requestAnimationFrame(sample);
    };
    vadRafRef.current = requestAnimationFrame(sample);
  };

  const stopVoiceActivityDetection = () => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    analyserRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  };

  // Starts (or restarts) a MediaRecorder on the shared stream. Each time it stops,
  // its segment is transcribed and appended to the composer; while still recording,
  // a new recorder is immediately started on the same stream for the next segment -
  // this is what gives the "part by part" streaming transcription.
  const startSegmentRecorder = (stream: MediaStream) => {
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    segmentPeakVolumeRef.current = 0;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      audioChunksRef.current = [];
      const hadSpeech = segmentPeakVolumeRef.current >= SPEECH_RMS_THRESHOLD;
      segmentPeakVolumeRef.current = 0;
      if (hadSpeech) {
        transcribeSegment(blob);
      } else {
        console.warn('[voice] segment skipped - no speech detected (peak below threshold)');
      }

      if (stoppingForSegmentRef.current && audioStreamRef.current) {
        // Still recording overall - roll straight into the next segment.
        stoppingForSegmentRef.current = false;
        startSegmentRecorder(audioStreamRef.current);
      } else {
        // Recording was fully stopped by the user.
        stream.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
  };

  const toggleRecording = async () => {
    if (recording) {
      setRecording(false);
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      stoppingForSegmentRef.current = false;
      stopVoiceActivityDetection();
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      segmentErrorShownRef.current = false;
      startVoiceActivityDetection(stream);
      startSegmentRecorder(stream);
      setRecording(true);

      // Cut a new segment every SEGMENT_MS so each chunk gets transcribed and
      // appended to the composer while the user keeps talking.
      segmentTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stoppingForSegmentRef.current = true;
          mediaRecorderRef.current.stop();
        }
      }, SEGMENT_MS);
    } catch {
      addMessage('assistant', 'Could not access the microphone. Check browser permissions.');
    }
  };

  // Safety net: if the component unmounts mid-recording, tear down the stream/timer.
  useEffect(() => {
    return () => {
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      stopVoiceActivityDetection();
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    addMessage('user', trimmed);
    setText('');
    setLoading(true);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: trimmed }),
      });
      const body = await res.json();

      if (!res.ok) {
        addMessage('assistant', body.error || 'Something went wrong while extracting details.');
        return;
      }

      const { filledCount, missingFields } = onExtracted(body.data as ExtractionResult);
      const filledMsg =
        filledCount > 0
          ? `Done! I filled ${filledCount} field${filledCount === 1 ? '' : 's'} in the form based on your description.`
          : "I couldn't find any new details to fill in - the matching fields may already be filled.";
      addMessage('assistant', filledMsg);

      if (missingFields.length > 0) {
        addMessage(
          'assistant',
          `I still need the following to complete the report: ${missingFields.join(', ')}. Could you provide these?`
        );
      }
    } catch {
      addMessage('assistant', 'Network error - could not reach the extraction service.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-grow the textarea up to a max height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // Keep the newest message in view
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="ai-chat no-print">
      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-title">
              <span className="ai-chat-avatar">✨</span>
              <div>
                <div className="ai-chat-name">FIR Assistant</div>
                <div className="ai-chat-status">
                  <span className="ai-soon">Text &amp; image extraction live</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="ai-chat-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>

          <div className="ai-chat-body" ref={bodyRef}>
            {messages.length === 0 ? (
              <div className="ai-chat-empty">Type a description of the incident below to get started.</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`ai-chat-bubble-msg ai-chat-bubble-msg--${m.role}`}>
                  {m.text}
                </div>
              ))
            )}
            {loading && (
              <div className="ai-chat-bubble-msg ai-chat-bubble-msg--assistant ai-chat-typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <div className="ai-chat-input">
            {(describing || recording) && (
              <div className="ai-chat-media-status">
                {recording ? 'Recording... click the mic again to stop.' : 'Generating description...'}
              </div>
            )}
            <div className="ai-chat-composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handleImagePick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="ai-chat-iconbtn"
                title="Attach image"
                aria-label="Attach image"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="M21 16.5l-5.2-5.2a2 2 0 0 0-2.83 0L4 20" />
                </svg>
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Describe the incident..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />

              <button
                type="button"
                className={`ai-chat-iconbtn${recording ? ' ai-chat-iconbtn--recording' : ''}`}
                title={recording ? 'Stop recording' : 'Record voice'}
                aria-label={recording ? 'Stop recording' : 'Record voice'}
                disabled={describing || loading}
                onClick={toggleRecording}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <path d="M12 18v3" />
                  <path d="M9 21h6" />
                </svg>
              </button>

              <button
                type="button"
                className="ai-chat-send"
                disabled={!canSend}
                title="Send"
                aria-label="Send"
                onClick={sendMessage}
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="ai-chat-bubble"
        aria-label="Open AI Assistant"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ai-chat-bubble-icon">✨</span>
        <span className="ai-chat-badge">AI</span>
      </button>
    </div>
  );
}
