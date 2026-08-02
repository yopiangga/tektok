import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headset, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, PanelLoading, Spinner } from '../../components/ui/Primitives';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { api } from '../../lib/api';
import { cx, formatTime } from '../../lib/format';
import type { ChatMessage } from '../../lib/types';
import { useAuth } from '../../store/auth';

export default function FieldChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ['field-chat'],
    queryFn: async () => {
      const { data } = await api.get<{ messages: ChatMessage[] }>('/messages');
      return data.messages;
    },
  });

  useSocketEvent<ChatMessage>('chat_message', () => {
    void queryClient.invalidateQueries({ queryKey: ['field-chat'] });
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.data]);

  const send = useMutation({
    mutationFn: (body: string) => api.post('/messages', { body }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['field-chat'] });
    },
  });

  return (
    <div className="field-page flex h-full flex-col space-y-0 overflow-hidden pb-3">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-white">Pesan</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/55">
          <Headset size={14} />
          Terhubung langsung ke operator pusat komando
        </p>
      </div>

      <div className="rounded-2xl border border-night-line bg-night-raised flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="panel-scroll flex-1 space-y-2.5 bg-night px-3 py-4">
          {messages.isLoading ? (
            <PanelLoading />
          ) : (messages.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Headset size={22} />}
              title="Belum ada percakapan"
              hint="Kirim pesan pertama Anda ke operator."
            />
          ) : (
            messages.data!.map((message) => {
              const mine = message.senderId === user?.id;
              return (
                <div key={message.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cx(
                      'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-soft',
                      mine
                        ? 'rounded-br-md bg-accent text-white'
                        : 'rounded-bl-md border border-night-line bg-night-raised text-white/80'
                    )}
                  >
                    {!mine && message.senderName && (
                      <p className="mb-0.5 text-[11px] font-semibold text-accent">
                        {message.senderName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p
                      className={cx(
                        'mt-1 text-right text-[10px] tabular-nums',
                        mine ? 'text-white/70' : 'text-white/40'
                      )}
                    >
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-night-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) send.mutate(draft.trim());
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) send.mutate(draft.trim());
              }
            }}
            rows={1}
            placeholder="Tulis pesan…"
            className="field max-h-28 min-h-[48px] flex-1 resize-none text-base"
            aria-label="Tulis pesan"
          />
          <button
            type="submit"
            className="btn-primary h-12 w-12 shrink-0 rounded-lg p-0"
            disabled={!draft.trim() || send.isPending}
            aria-label="Kirim pesan"
          >
            {send.isPending ? <Spinner size={18} /> : <Send size={19} />}
          </button>
        </form>
      </div>
    </div>
  );
}
