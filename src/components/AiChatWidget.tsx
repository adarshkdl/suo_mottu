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

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            describeMedia({ audio: reader.result });
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      addMessage('assistant', 'Could not access the microphone. Check browser permissions.');
    }
  };

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
