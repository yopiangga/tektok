import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSocketEvent } from '../../hooks/useSocketEvent';
import { api } from '../../lib/api';
import { STATUS_COLOR, cx, formatTime, timeAgo } from '../../lib/format';
import type { ChatMessage, PresenceStatus } from '../../lib/types';
import { useAuth } from '../../store/auth';
import { Avatar, EmptyState, PanelLoading, StatusDot } from '../ui/Primitives';

interface Thread {
  partner: {
    id: number;
    fullName: string;
    badgeNumber: string | null;
    unitName: string | null;
    status: PresenceStatus;
  };
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export default function ChatDrawer({
  open,
  onClose,
  activePartnerId,
  onActivePartnerChange,
}: {
  open: boolean;
  onClose: () => void;
  activePartnerId: number | null;
  onActivePartnerChange: (id: number | null) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const threads = useQuery({
    queryKey: ['chat-threads'],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.get<{ threads: Thread[] }>('/messages/threads');
      return data.threads;
    },
  });

  const conversation = useQuery({
    queryKey: ['chat', activePartnerId],
    enabled: open && activePartnerId != null,
    queryFn: async () => {
      const { data } = await api.get<{ messages: ChatMessage[] }>('/messages', {
        params: { userId: activePartnerId },
      });
      return data.messages;
    },
  });

  useSocketEvent<ChatMessage>('chat_message', (message) => {
    void queryClient.invalidateQueries({ queryKey: ['chat-threads'] });
    const partner = message.senderId === user?.id ? message.receiverId : message.senderId;
    if (partner === activePartnerId) {
      void queryClient.invalidateQueries({ queryKey: ['chat', activePartnerId] });
    }
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.data]);

  const send = useMutation({
    mutationFn: (body: string) => api.post('/messages', { receiverId: activePartnerId, body }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['chat', activePartnerId] });
      void queryClient.invalidateQueries({ queryKey: ['chat-threads'] });
    },
  });

  const active = threads.data?.find((t) => t.partner.id === activePartnerId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[900] flex justify-end">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]" onClick={onClose} aria-hidden />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-canvas-raised shadow-lift">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          {activePartnerId != null && (
            <button
              type="button"
              onClick={() => onActivePartnerChange(null)}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas-sunken hover:text-ink"
              aria-label="Kembali ke daftar percakapan"
            >
              <ArrowLeft size={17} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
              <MessageSquare size={16} className="shrink-0 text-accent" />
              {active ? active.partner.fullName : 'Pesan'}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {active
                ? `${active.partner.unitName ?? 'Tanpa unit'} · ${active.partner.status}`
                : 'Komunikasi langsung dengan personel'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas-sunken hover:text-ink"
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </header>

        {activePartnerId == null ? (
          <div className="panel-scroll flex-1">
            {threads.isLoading ? (
              <PanelLoading />
            ) : (threads.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title="Belum ada percakapan"
                hint="Buka detail personel lalu pilih “Kirim Pesan” untuk memulai."
              />
            ) : (
              <ul className="divide-y divide-line">
                {threads.data!.map((thread) => (
                  <li key={thread.partner.id}>
                    <button
                      type="button"
                      onClick={() => onActivePartnerChange(thread.partner.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
                    >
                      <Avatar name={thread.partner.fullName} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                            <StatusDot color={STATUS_COLOR[thread.partner.status]} />
                            {thread.partner.fullName}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-faint">
                            {timeAgo(thread.lastMessageAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {thread.lastMessage}
                        </span>
                      </span>
                      {thread.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
                          {thread.unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="panel-scroll flex-1 space-y-2.5 bg-canvas px-4 py-4">
              {conversation.isLoading ? (
                <PanelLoading />
              ) : (conversation.data?.length ?? 0) === 0 ? (
                <EmptyState title="Belum ada pesan" hint="Kirim pesan pertama ke personel ini." />
              ) : (
                conversation.data!.map((message) => {
                  const mine = message.senderId === user?.id;
                  return (
                    <div key={message.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cx(
                          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-soft',
                          mine
                            ? 'rounded-br-md bg-accent text-white'
                            : 'rounded-bl-md border border-line bg-canvas-raised text-ink-soft'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p
                          className={cx(
                            'mt-1 text-right text-[10px] tabular-nums',
                            mine ? 'text-white/70' : 'text-ink-faint'
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
              className="flex items-end gap-2 border-t border-line p-3"
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
                className="field max-h-28 min-h-[40px] flex-1 resize-none"
                aria-label="Tulis pesan"
              />
              <button
                type="submit"
                className="btn-primary h-10 w-10 shrink-0 rounded-lg p-0"
                disabled={!draft.trim() || send.isPending}
                aria-label="Kirim"
              >
                <Send size={17} />
              </button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
