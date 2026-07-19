import { useEffect, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'axel' | 'system';
  text: string;
  timestamp: number;
}

interface ChatDisplayProps {
  messages: ChatMessage[];
  interimTranscript?: string;
}

export default function ChatDisplay({ messages, interimTranscript }: ChatDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, interimTranscript]);

  if (messages.length === 0 && !interimTranscript) {
    return null;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4" style={{ maxHeight: '40vh' }}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-lg ${
              message.role === 'user'
                ? 'bg-blue-600/90 text-white'
                : message.role === 'system'
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border border-cyan-500/20 bg-slate-800/80 text-cyan-50 shadow-cyan-500/10'
            }`}
          >
            {message.text}
          </div>
        </div>
      ))}
      {interimTranscript && (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl bg-blue-600/40 px-4 py-2.5 text-sm italic text-blue-100">
            {interimTranscript}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
