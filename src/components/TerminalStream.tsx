import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  ImagePlus,
  Loader2,
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  ShieldCheck,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AgentRolePreset,
  AgentSettings,
  ImageAttachment,
  TerminalMessage,
  ToolCallRecord,
} from '../types/agent';
import { DiffBlock } from './DiffBlock';

interface PendingPermissionAction {
  messageId: string;
  toolCall: ToolCallRecord;
}

interface TerminalStreamProps {
  messages: TerminalMessage[];
  settings: AgentSettings;
  isBusy: boolean;
  busyPhase: string;
  pendingPermission: PendingPermissionAction | null;
  draftInput: string;
  onDraftChange: (value: string) => void;
  onSendPrompt: (text: string, image?: ImageAttachment) => void;
  onStopAgent: () => void;
  onPermissionDecision: (decision: 'once' | 'session' | 'deny') => void;
  onUpdateSettings: (patch: Partial<AgentSettings>) => void;
  onOpenFile: (path: string) => void;
  onRevertSnapshot: (snapshotId: string) => void;
  onRunSlashCommand: (cmd: string) => boolean;
}

const SLASH_COMMANDS = [
  { cmd: '/files', desc: 'Tampilkan daftar file workspace aktif di terminal' },
  { cmd: '/termux', desc: 'Buka Termux Android Bridge & daftar skrip' },
  { cmd: '/think', desc: 'Aktifkan atau matikan mode High Thinking' },
  { cmd: '/mode', desc: 'Ganti mode izin antara Minta Izin dan Otomatis' },
  { cmd: '/export', desc: 'Unduh seluruh proyek workspace sebagai ZIP' },
  { cmd: '/clear', desc: 'Bersihkan riwayat percakapan terminal' },
];

const STARTER_PROMPTS = [
  {
    title: 'Periksa & perbaiki bug kode',
    prompt: 'Periksa src/calculator.ts, temukan bug perhitungan diskonnya, lalu perbaiki dengan edit_file.',
  },
  {
    title: 'Buat skrip Termux Android',
    prompt: 'Buatkan skrip Termux untuk mengecek status baterai dan ruang penyimpanan /sdcard lalu tampilkan notifikasi Android.',
  },
  {
    title: 'Ringkas seluruh workspace',
    prompt: 'Baca daftar file di workspace ini lalu jelaskan arsitektur dan hubungan antar file secara singkat.',
  },
];

const TOOL_LABELS: Record<string, string> = {
  list_files: 'Daftar File',
  read_file: 'Baca File',
  search_files: 'Cari Pola',
  write_file: 'Tulis File',
  edit_file: 'Edit File',
  delete_file: 'Hapus File',
  run_js_snippet: 'Jalankan Sandbox JS',
  save_termux_script: 'Simpan Skrip Termux',
};

const FormattedProse: React.FC<{ text: string }> = ({ text }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const segments = useMemo(() => {
    const parts: Array<{ type: 'text' | 'code'; lang?: string; content: string }> = [];
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', lang: match[1] || 'text', content: match[2].replace(/\n$/, '') });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }
    return parts;
  }, [text]);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-[#E7EDF6]">
      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return (
            <div
              key={idx}
              className="overflow-hidden rounded-lg border border-[#242E3F] bg-[#0B0E14]"
            >
              <div className="flex items-center justify-between border-b border-[#242E3F] bg-[#121721] px-3 py-1.5">
                <span className="font-mono text-[11px] text-[#8C99B0]">{seg.lang}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(seg.content);
                      setCopiedIdx(idx);
                      setTimeout(() => setCopiedIdx(null), 1600);
                    } catch {
                      // Ignore clipboard error
                    }
                  }}
                  aria-label="Salin blok kode"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
                >
                  {copiedIdx === idx ? (
                    <>
                      <Check className="h-3 w-3 text-[#22C55E]" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-[#D8E1F0]">
                {seg.content}
              </pre>
            </div>
          );
        }

        const lines = seg.content.split('\n');
        return (
          <div key={idx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              if (!line.trim()) return null;
              return (
                <p key={lIdx} className="whitespace-pre-wrap break-words">
                  {renderInlineCode(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

function renderInlineCode(line: string): React.ReactNode[] {
  const chunks = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, i) => {
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-[#18202D] px-1.5 py-0.5 font-mono text-[12px] text-[#FDE6C4]"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <strong key={i} className="font-semibold text-[#FFFFFF]">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{chunk}</React.Fragment>;
  });
}

const ToolInvocationRow: React.FC<{
  tc: ToolCallRecord;
  isCurrentPending: boolean;
  onPermissionDecision: (decision: 'once' | 'session' | 'deny') => void;
  onOpenFile: (path: string) => void;
  onRevertSnapshot: (snapshotId: string) => void;
}> = ({ tc, isCurrentPending, onPermissionDecision, onOpenFile, onRevertSnapshot }) => {
  const [expanded, setExpanded] = useState(isCurrentPending);

  useEffect(() => {
    if (isCurrentPending) setExpanded(true);
  }, [isCurrentPending]);

  const targetPath = typeof tc.args.path === 'string' ? tc.args.path : undefined;
  const label = TOOL_LABELS[tc.name] || tc.name;

  const statusMeta = {
    pending: { text: 'Menunggu izin Anda', color: 'text-[#F59E0B]' },
    approved: { text: 'Diizinkan', color: 'text-[#22C55E]' },
    auto: { text: 'Otomatis', color: 'text-[#8C99B0]' },
    denied: { text: 'Ditolak pengguna', color: 'text-[#FCA5A5]' },
    error: { text: 'Galat', color: 'text-[#FCA5A5]' },
  }[tc.status];

  return (
    <div
      className={`rounded-lg border ${
        isCurrentPending
          ? 'border-[#F09A3E]/70 bg-[#18202D]'
          : 'border-[#242E3F] bg-[#121721]'
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex min-h-[42px] w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8C99B0]" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8C99B0]" aria-hidden="true" />
          )}
          <Wrench className="h-3.5 w-3.5 shrink-0 text-[#F09A3E]" aria-hidden="true" />
          <span className="font-mono text-xs font-medium text-[#E7EDF6] whitespace-nowrap">
            {label}
          </span>
          {targetPath && (
            <span className="truncate font-mono text-xs text-[#8C99B0]">{targetPath}</span>
          )}
        </div>
        <span className={`font-mono text-[11px] whitespace-nowrap shrink-0 ${statusMeta.color}`}>
          {statusMeta.text}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[#242E3F] px-3 py-3">
          {typeof tc.args.summary === 'string' && tc.args.summary && (
            <p className="text-xs text-[#C9D4E6]">{tc.args.summary}</p>
          )}
          {typeof tc.args.description === 'string' && tc.args.description && (
            <p className="text-xs text-[#C9D4E6]">{tc.args.description}</p>
          )}

          {tc.diffPreview && <DiffBlock diffText={tc.diffPreview} />}

          {!tc.diffPreview && Object.keys(tc.args).length > 0 && (
            <pre className="max-h-40 overflow-auto rounded-lg border border-[#242E3F] bg-[#0B0E14] p-2.5 font-mono text-[11px] text-[#8C99B0]">
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          )}

          {tc.result && (
            <div className="space-y-1">
              <p className="font-mono text-[11px] text-[#8C99B0]">Hasil Eksekusi</p>
              <pre className="max-h-44 overflow-auto rounded-lg border border-[#242E3F] bg-[#0B0E14] p-2.5 font-mono text-[11px] text-[#C9D4E6]">
                {JSON.stringify(tc.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Action links for completed file mutations */}
          {!isCurrentPending && (targetPath || tc.snapshotId) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {targetPath && tc.name !== 'delete_file' && (
                <button
                  type="button"
                  onClick={() => onOpenFile(targetPath)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-2.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                  <span>Buka File</span>
                </button>
              )}
              {tc.snapshotId && (
                <button
                  type="button"
                  onClick={() => onRevertSnapshot(tc.snapshotId!)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-2.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                  <span>Undo Perubahan</span>
                </button>
              )}
            </div>
          )}

          {/* Inline Permission Approval Gate */}
          {isCurrentPending && (
            <div className="space-y-2.5 border-t border-[#242E3F] pt-3">
              <p className="text-xs font-medium text-[#FDE6C4]">
                Izinkan Koda menjalankan <code className="font-mono">{tc.name}</code>?
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPermissionDecision('once')}
                  className="min-h-[42px] rounded-lg bg-[#F09A3E] px-3.5 text-xs font-semibold text-[#0B0E14] transition-colors hover:bg-[#F5AE5F] whitespace-nowrap"
                >
                  Izinkan Sekali
                </button>
                <button
                  type="button"
                  onClick={() => onPermissionDecision('session')}
                  className="min-h-[42px] rounded-lg border border-[#22C55E]/50 bg-[#22C55E]/12 px-3.5 text-xs font-medium text-[#86EFAC] transition-colors hover:bg-[#22C55E]/20 whitespace-nowrap"
                >
                  Izinkan Semua Sesi Ini
                </button>
                <button
                  type="button"
                  onClick={() => onPermissionDecision('deny')}
                  className="min-h-[42px] rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3.5 text-xs font-medium text-[#FCA5A5] transition-colors hover:bg-[#EF4444]/20 whitespace-nowrap"
                >
                  Tolak
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TerminalStream: React.FC<TerminalStreamProps> = ({
  messages,
  settings,
  isBusy,
  busyPhase,
  pendingPermission,
  draftInput,
  onDraftChange,
  onSendPrompt,
  onStopAgent,
  onPermissionDecision,
  onUpdateSettings,
  onOpenFile,
  onRevertSnapshot,
  onRunSlashCommand,
}) => {
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isBusy, pendingPermission?.toolCall.id]);

  const matchingSlashCommands = useMemo(() => {
    const trimmed = draftInput.trim();
    if (!trimmed.startsWith('/')) return [];
    if (trimmed.includes(' ')) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(trimmed.toLowerCase()));
  }, [draftInput]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
      setAttachedImage({
        name: file.name,
        mimeType: file.type || 'image/png',
        dataUrl,
        base64,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const submitCurrent = () => {
    const trimmed = draftInput.trim();
    if ((!trimmed && !attachedImage) || isBusy || pendingPermission) return;

    if (trimmed.startsWith('/') && !attachedImage) {
      const handled = onRunSlashCommand(trimmed);
      if (handled) {
        onDraftChange('');
        return;
      }
    }

    onSendPrompt(trimmed || 'Analisis gambar yang saya lampirkan.', attachedImage || undefined);
    onDraftChange('');
    setAttachedImage(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0B0E14]">
      {/* Terminal workspace controls bar */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto border-b border-[#242E3F] bg-[#121721]/80 px-3.5 py-2">
        {/* Permission mode segmented control */}
        <div
          role="group"
          aria-label="Mode perizinan agent"
          className="inline-flex shrink-0 items-center rounded-lg bg-[#0B0E14] p-0.5 border border-[#242E3F]"
        >
          <button
            type="button"
            onClick={() => onUpdateSettings({ permissionMode: 'ask' })}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              settings.permissionMode === 'ask'
                ? 'bg-[#18202D] text-[#F09A3E]'
                : 'text-[#8C99B0] hover:text-[#E7EDF6]'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Minta Izin</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ permissionMode: 'auto' })}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              settings.permissionMode === 'auto'
                ? 'bg-[#18202D] text-[#22C55E]'
                : 'text-[#8C99B0] hover:text-[#E7EDF6]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Otomatis</span>
          </button>
        </div>

        {/* Right side: High Thinking + Role preset */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={settings.highThinking}
            onClick={() => onUpdateSettings({ highThinking: !settings.highThinking })}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              settings.highThinking
                ? 'border-[#F09A3E]/60 bg-[#F09A3E]/12 text-[#FDE6C4]'
                : 'border-[#242E3F] bg-[#0B0E14] text-[#8C99B0] hover:text-[#E7EDF6]'
            }`}
          >
            <Brain className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
            <span>High Thinking</span>
          </button>

          <label className="sr-only" htmlFor="agent-role-select">
            Pilih peran agent
          </label>
          <select
            id="agent-role-select"
            value={settings.rolePreset}
            onChange={(e) =>
              onUpdateSettings({ rolePreset: e.target.value as AgentRolePreset })
            }
            className="min-h-[36px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-2.5 text-xs font-medium text-[#E7EDF6]"
          >
            <option value="coder">Coding Agent</option>
            <option value="termux">Termux Architect</option>
            <option value="reviewer">Code Reviewer</option>
          </select>
        </div>
      </div>

      {/* Scrollable terminal stream */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col justify-center py-6 sm:py-12">
            <div className="inline-flex w-fit items-center gap-2 font-mono text-xs text-[#8C99B0]">
              <Terminal className="h-4 w-4 text-[#F09A3E]" aria-hidden="true" />
              <span>
                {settings.workspaceName} ·{' '}
                {settings.permissionMode === 'ask' ? 'Mode Minta Izin' : 'Mode Otomatis'} ·{' '}
                {settings.highThinking ? 'High Thinking Aktif' : 'Penalaran Standar'}
              </span>
            </div>

            <h1 className="mt-3 font-display text-2xl font-bold leading-[1.18] tracking-[-0.015em] text-[#E7EDF6] sm:text-3xl">
              AI Coding &amp; Termux Agent di saku Anda
            </h1>
            <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-[#8C99B0]">
              Koda dapat membaca struktur file lokal, mencari simbol kode, mengusulkan perubahan dengan pratinjau diff, menganalisis screenshot error, dan menyusun skrip Termux Android siap pakai.
            </p>

            {/* Starter command cards */}
            <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onSendPrompt(item.prompt)}
                  className="flex min-h-[84px] flex-col justify-between rounded-xl border border-[#242E3F] bg-[#121721] p-3.5 text-left transition-colors hover:border-[#F09A3E]/60 hover:bg-[#18202D]"
                >
                  <span className="font-display text-xs font-semibold text-[#E7EDF6]">
                    {item.title}
                  </span>
                  <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#8C99B0]">
                    {item.prompt}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-5 font-mono text-xs text-[#697791]">
              Ketik <span className="text-[#E7EDF6]">/</span> untuk perintah cepat (/files, /termux, /think, /export) atau lampirkan screenshot error.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => {
              if (msg.role === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-[#242E3F] bg-[#121721]/70 px-3.5 py-2.5 font-mono text-xs text-[#8C99B0] whitespace-pre-wrap"
                  >
                    {msg.text}
                  </div>
                );
              }

              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="space-y-2">
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 font-mono text-sm font-bold text-[#F09A3E]"
                      >
                        &gt;
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        {msg.image && (
                          <div className="inline-block overflow-hidden rounded-lg border border-[#242E3F] bg-[#121721]">
                            <img
                              src={msg.image.dataUrl}
                              alt={`Lampiran ${msg.image.name}`}
                              referrerPolicy="no-referrer"
                              className="max-h-48 w-auto object-contain"
                            />
                            <p className="border-t border-[#242E3F] px-2.5 py-1 font-mono text-[11px] text-[#8C99B0]">
                              {msg.image.name}
                            </p>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-[#FFFFFF]">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const thoughtOpen = Boolean(expandedThoughts[msg.id]);

              return (
                <div
                  key={msg.id}
                  className={`space-y-3 rounded-xl border p-4 ${
                    msg.error
                      ? 'border-[#EF4444]/40 bg-[#EF4444]/8'
                      : 'border-[#242E3F] bg-[#121721]/60'
                  }`}
                >
                  {/* Quiet inline metadata */}
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[#8C99B0]">
                    <span className="font-semibold text-[#E7EDF6]">Koda</span>
                    {msg.modelUsed && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{msg.modelUsed}</span>
                      </>
                    )}
                    {msg.highThinking && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#F09A3E]">High Thinking</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Collapsible thought summary */}
                  {msg.thoughtSummary && (
                    <div className="rounded-lg border border-[#242E3F] bg-[#0B0E14]">
                      <button
                        type="button"
                        aria-expanded={thoughtOpen}
                        onClick={() =>
                          setExpandedThoughts((prev) => ({
                            ...prev,
                            [msg.id]: !prev[msg.id],
                          }))
                        }
                        className="flex min-h-[38px] w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-[#8C99B0] hover:text-[#E7EDF6]"
                      >
                        {thoughtOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <Brain className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                        <span>Proses Penalaran</span>
                      </button>
                      {thoughtOpen && (
                        <div className="border-t border-[#242E3F] px-3 py-2.5 text-xs leading-relaxed text-[#8C99B0] whitespace-pre-wrap">
                          {msg.thoughtSummary}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool call timeline */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="space-y-2">
                      {msg.toolCalls.map((tc) => (
                        <ToolInvocationRow
                          key={tc.id}
                          tc={tc}
                          isCurrentPending={
                            pendingPermission?.messageId === msg.id &&
                            pendingPermission.toolCall.id === tc.id
                          }
                          onPermissionDecision={onPermissionDecision}
                          onOpenFile={onOpenFile}
                          onRevertSnapshot={onRevertSnapshot}
                        />
                      ))}
                    </div>
                  )}

                  {/* Assistant prose response */}
                  {msg.text && <FormattedProse text={msg.text} />}
                </div>
              );
            })}

            {isBusy && !pendingPermission && (
              <div className="flex items-center gap-2.5 px-1 py-2 font-mono text-xs text-[#8C99B0]">
                <Loader2 className="h-4 w-4 animate-spin text-[#F09A3E]" aria-hidden="true" />
                <span>{busyPhase || 'Koda sedang memproses...'}</span>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative border-t border-[#242E3F] bg-[#121721] px-3.5 py-2.5 sm:px-5">
        {/* Slash command menu */}
        {matchingSlashCommands.length > 0 && (
          <div
            role="listbox"
            aria-label="Daftar perintah cepat"
            className="absolute bottom-full left-3.5 right-3.5 mb-2 max-w-2xl overflow-hidden rounded-xl border border-[#242E3F] bg-[#18202D] shadow-xl sm:left-5"
          >
            {matchingSlashCommands.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => {
                  onRunSlashCommand(item.cmd);
                  onDraftChange('');
                  textareaRef.current?.focus();
                }}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-[#242E3F] px-3.5 py-2 text-left last:border-b-0 hover:bg-[#222D3F]"
              >
                <span className="font-mono text-xs font-semibold text-[#F09A3E]">
                  {item.cmd}
                </span>
                <span className="truncate text-xs text-[#C9D4E6]">{item.desc}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-2">
          {/* Attached screenshot preview */}
          {attachedImage && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={attachedImage.dataUrl}
                  alt={`Pratinjau ${attachedImage.name}`}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded object-cover border border-[#242E3F]"
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-[#E7EDF6]">
                    {attachedImage.name}
                  </p>
                  <p className="text-[11px] text-[#8C99B0]">Siap dianalisis agent</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                aria-label="Hapus lampiran gambar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Unggah screenshot atau foto untuk dianalisis"
              onChange={handleImagePick}
            />

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isBusy || Boolean(pendingPermission)}
              aria-label="Lampirkan gambar atau screenshot"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#242E3F] bg-[#0B0E14] text-[#8C99B0] transition-colors hover:border-[#F09A3E]/60 hover:text-[#E7EDF6] disabled:opacity-40"
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="relative flex-1">
              <label htmlFor="terminal-prompt-input" className="sr-only">
                Tulis perintah untuk Koda Agent
              </label>
              <textarea
                id="terminal-prompt-input"
                ref={textareaRef}
                rows={1}
                value={draftInput}
                disabled={Boolean(pendingPermission)}
                onChange={(e) => {
                  onDraftChange(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitCurrent();
                    if (textareaRef.current) textareaRef.current.style.height = 'auto';
                  }
                }}
                placeholder={
                  pendingPermission
                    ? 'Pilih izin di atas terlebih dahulu...'
                    : 'Tulis perintah atau ketik / ...'
                }
                className="max-h-36 min-h-[44px] w-full resize-none overflow-y-auto rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3.5 py-2.5 text-sm leading-5 text-[#E7EDF6] placeholder:text-[#697791] disabled:opacity-50"
              />
            </div>

            {isBusy ? (
              <button
                type="button"
                onClick={onStopAgent}
                aria-label="Hentikan agent"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#EF4444]/50 bg-[#EF4444]/15 text-[#FCA5A5] transition-colors hover:bg-[#EF4444]/25"
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submitCurrent}
                disabled={(!draftInput.trim() && !attachedImage) || Boolean(pendingPermission)}
                aria-label="Kirim perintah ke Koda"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#F09A3E] text-[#0B0E14] transition-colors hover:bg-[#F5AE5F] disabled:opacity-40"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
