'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useT } from '@/lib/LanguageContext';

interface User { name: string; role: string; inventoryEnabled?: boolean; marketingEnabled?: boolean; }
interface CompanyUser { id: number; name: string; role: string; }
interface Message {
  id: number;
  sender_id: number;
  recipient_id: number | null;
  body: string;
  created_at: string;
  sender_name: string;
}
interface Conversation {
  partnerId: number;
  partnerName: string;
  lastMessage: string;
  lastMessageAt: string;
  senderId: number;
  unread: number;
}
interface ConversationList {
  general: { lastMessage: Message | null; unread: number };
  conversations: Conversation[];
  users: CompanyUser[];
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const time = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Hier ${time}`;
  if (diffDays < 7) return d.toLocaleDateString('fr-CA', { weekday: 'short' }) + ` ${time}`;
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function roleBadge(role: string) {
  if (role === 'admin') return 'bg-purple-100 text-purple-700';
  if (role === 'office') return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin';
  if (role === 'office') return 'Bureau';
  return 'Électricien';
}

export default function MessagesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<number>(0);
  const [convList, setConvList] = useState<ConversationList | null>(null);
  const [activeChat, setActiveChat] = useState<{ type: 'general' } | { type: 'direct'; partnerId: number; partnerName: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useT();

  // Load user
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (!u || u.error) { router.push('/'); return; }
      setUser(u);
      setUserId(u.id);
    }).catch(() => router.push('/'));
  }, [router]);

  // Load conversation list
  const loadConversations = useCallback(() => {
    fetch('/api/messages').then(r => r.json()).then(data => {
      if (!data.error) setConvList(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [user, loadConversations]);

  // Load messages for active chat
  const loadMessages = useCallback(() => {
    if (!activeChat) return;
    const url = activeChat.type === 'general'
      ? '/api/messages?channel=general'
      : `/api/messages?with=${activeChat.partnerId}`;
    fetch(url).then(r => r.json()).then(data => {
      if (data.messages) {
        setMessages(data.messages);
        // Mark as read
        const unreadIds = data.messages
          .filter((m: Message) => m.sender_id !== userId)
          .map((m: Message) => m.id);
        if (unreadIds.length > 0) {
          fetch('/api/messages/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds: unreadIds }),
          });
        }
      }
    }).catch(() => {});
  }, [activeChat, userId]);

  useEffect(() => {
    loadMessages();
    if (!activeChat) return;
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [activeChat, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: activeChat?.type === 'direct' ? activeChat.partnerId : null,
          body: input.trim(),
        }),
      });
      setInput('');
      loadMessages();
      loadConversations();
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  }

  function openChat(chat: typeof activeChat) {
    setActiveChat(chat);
    setMessages([]);
    setShowNewConv(false);
  }

  function startNewConversation(u: CompanyUser) {
    openChat({ type: 'direct', partnerId: u.id, partnerName: u.name });
    setShowNewConv(false);
  }

  if (!user) return <div className="flex items-center justify-center min-h-screen"><p>{t('loading')}</p></div>;

  const chatTitle = activeChat?.type === 'general'
    ? t('msg_general_channel')
    : activeChat?.type === 'direct' ? activeChat.partnerName : '';

  // Conversation list panel
  const convPanel = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-white">
        <h2 className="font-bold text-lg text-gray-900">{t('nav_messages')}</h2>
        <button
          onClick={() => setShowNewConv(!showNewConv)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
          title={t('msg_new_conversation')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* New conversation picker */}
      {showNewConv && convList && (
        <div className="border-b border-gray-200 bg-gray-50 p-3 space-y-1">
          <p className="text-xs text-gray-500 font-medium mb-2">{t('msg_select_recipient')}</p>
          {convList.users.map(u => (
            <button
              key={u.id}
              onClick={() => startNewConversation(u)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white transition text-left"
            >
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge(u.role)}`}>
                {roleLabel(u.role)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* General channel */}
        <button
          onClick={() => openChat({ type: 'general' })}
          className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition text-left ${activeChat?.type === 'general' ? 'bg-blue-50' : ''}`}
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t('msg_general_channel')}</p>
            {convList?.general.lastMessage && (
              <p className="text-xs text-gray-500 truncate">
                <span className="font-medium">{convList.general.lastMessage.sender_name}:</span>{' '}
                {convList.general.lastMessage.body}
              </p>
            )}
          </div>
          {(convList?.general.unread || 0) > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
              {convList!.general.unread}
            </span>
          )}
        </button>

        {/* Direct conversations */}
        {convList?.conversations.map(conv => (
          <button
            key={conv.partnerId}
            onClick={() => openChat({ type: 'direct', partnerId: conv.partnerId, partnerName: conv.partnerName })}
            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition text-left ${activeChat?.type === 'direct' && activeChat.partnerId === conv.partnerId ? 'bg-blue-50' : ''}`}
          >
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {conv.partnerName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 truncate">{conv.partnerName}</p>
                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageAt)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
            </div>
            {conv.unread > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                {conv.unread}
              </span>
            )}
          </button>
        ))}

        {!convList?.conversations.length && !convList?.general.lastMessage && (
          <div className="text-center py-12 text-gray-400 text-sm">{t('msg_no_conversations')}</div>
        )}
      </div>
    </div>
  );

  // Message thread panel
  const threadPanel = activeChat ? (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 bg-white flex-shrink-0">
        <button
          onClick={() => setActiveChat(null)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition -ml-1"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {activeChat.type === 'general' ? (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {activeChat.partnerName.charAt(0).toUpperCase()}
          </div>
        )}
        <h3 className="font-semibold text-gray-900">{chatTitle}</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">{t('msg_no_messages')}</div>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.sender_id === userId;
          const showName = !isMine && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
                {showName && (
                  <p className="text-[11px] text-gray-500 font-medium mb-0.5 px-1">{msg.sender_name}</p>
                )}
                <div className={`rounded-2xl px-3.5 py-2 ${isMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 border border-gray-200'}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
                <p className={`text-[10px] mt-0.5 px-1 ${isMine ? 'text-right text-gray-400' : 'text-gray-400'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-3 py-2 border-t border-gray-200 bg-white flex gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t('msg_type_message')}
          className="flex-1 rounded-full border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="bg-blue-600 text-white w-11 h-11 rounded-full font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  ) : (
    <div className="hidden md:flex flex-1 items-center justify-center text-gray-400 text-sm">
      {t('msg_no_messages')}
    </div>
  );

  return (
    <div>
      <NavBar role={user.role} name={user.name} inventoryEnabled={user.inventoryEnabled} marketingEnabled={user.marketingEnabled} />

      {/* Mobile: 100dvh - top bar (56px) - bottom nav (~76px with safe area) */}
      {/* Desktop: full viewport, sidebar margin */}
      <div className="md:ml-56 h-[calc(100dvh-132px)] md:h-dvh flex">
        {/* Mobile: show either conv list or thread */}
        <div className={`md:hidden w-full h-full ${activeChat ? 'hidden' : 'block'}`}>
          {convPanel}
        </div>
        <div className={`md:hidden w-full h-full ${activeChat ? 'block' : 'hidden'}`}>
          {threadPanel}
        </div>

        {/* Desktop: two-column */}
        <div className="hidden md:flex w-full h-full">
          <div className="w-80 border-r border-gray-200 flex-shrink-0 bg-white">
            {convPanel}
          </div>
          <div className="flex-1 flex flex-col">
            {threadPanel}
          </div>
        </div>
      </div>
    </div>
  );
}
