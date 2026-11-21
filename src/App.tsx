import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderCode,
  PanelRight,
  Settings,
  Smartphone,
  Terminal,
  WifiOff,
} from 'lucide-react';
import type {
  AgentSettings,
  AgentStepResponse,
  FileSnapshot,
  GeminiContent,
  GeminiPart,
  ImageAttachment,
  TerminalMessage,
  TermuxScript,
  ToolCallRecord,
  WorkspaceFile,
} from './types/agent';
import {
  createInitialState,
  exportWorkspaceAsZip,
  loadPersistedState,
  savePersistedState,
} from './utils/storage';
import {
  buildToolDiffPreview,
  buildWorkspaceSummary,
  detectLanguage,
  executeWorkspaceTool,
  normalizePath,
  requiresPermission,
} from './utils/workspaceTools';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { PWAInstallButton } from './components/PWAInstallButton';
import { FileExplorer } from './components/FileExplorer';
import { CodeInspector } from './components/CodeInspector';
import { TerminalStream } from './components/TerminalStream';
import { TermuxStudio } from './components/TermuxStudio';
import { SettingsView } from './components/SettingsView';

type ActiveTab = 'terminal' | 'files' | 'termux' | 'settings';

interface PendingBatchState {
  messageId: string;
  calls: ToolCallRecord[];
  currentIndex: number;
  collectedResponses: GeminiPart[];
  historyBeforeResponses: GeminiContent[];
  stepCount: number;
}

const MAX_AGENT_STEPS = 8;

const TEXT_FILE_MAX_BYTES = 800_000;

export default function App() {
  const initial = createInitialState();

  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('terminal');
  const [files, setFiles] = useState<Record<string, WorkspaceFile>>(initial.files);
  const [snapshots, setSnapshots] = useState<FileSnapshot[]>(initial.snapshots);
  const [termuxScripts, setTermuxScripts] = useState<TermuxScript[]>(initial.termuxScripts);
  const [messages, setMessages] = useState<TerminalMessage[]>(initial.messages);
  const [modelHistory, setModelHistory] = useState<GeminiContent[]>(initial.modelHistory);
  const [settings, setSettings] = useState<AgentSettings>(initial.settings);
  const [sessionTitle, setSessionTitle] = useState<string>(initial.sessionTitle);
  const [sessionTrustedTools, setSessionTrustedTools] = useState<string[]>([]);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>('src/calculator.ts');
  const [desktopInspectorOpen, setDesktopInspectorOpen] = useState<boolean>(true);
  const [draftInput, setDraftInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState('');
  const [pendingBatch, setPendingBatch] = useState<PendingBatchState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isOnline = useOnlineStatus();
  const abortRef = useRef<AbortController | null>(null);

  // Refs for latest state inside async multi-step loops
  const filesRef = useRef(files);
  const scriptsRef = useRef(termuxScripts);
  const settingsRef = useRef(settings);
  const trustedRef = useRef(sessionTrustedTools);

  filesRef.current = files;
  scriptsRef.current = termuxScripts;
  settingsRef.current = settings;
  trustedRef.current = sessionTrustedTools;

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Hydrate persisted IndexedDB state
  useEffect(() => {
    let active = true;
    loadPersistedState().then((loaded) => {
      if (!active) return;
      setFiles(loaded.files);
      setSnapshots(loaded.snapshots);
      setTermuxScripts(loaded.termuxScripts);
      setMessages(loaded.messages);
      setModelHistory(loaded.modelHistory);
      setSettings(loaded.settings);
      setSessionTitle(loaded.sessionTitle);
      const firstFile = Object.keys(loaded.files).sort()[0] ?? null;
      setSelectedFilePath((prev) => (prev && loaded.files[prev] ? prev : firstFile));
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Save state changes to IndexedDB
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void savePersistedState({
        files,
        snapshots,
        termuxScripts,
        messages,
        modelHistory,
        settings,
        sessionTitle,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [hydrated, files, snapshots, termuxScripts, messages, modelHistory, settings, sessionTitle]);

  const updateSettings = useCallback((patch: Partial<AgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUploadFiles = useCallback(
    async (fileList: FileList) => {
      const nextFiles = { ...filesRef.current };
      let addedCount = 0;
      let skippedBinary = 0;
      let lastAddedPath: string | null = null;

      for (const file of Array.from(fileList)) {
        if (file.size > TEXT_FILE_MAX_BYTES) {
          skippedBinary++;
          continue;
        }
        const rawRel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        let normalized: string;
        try {
          normalized = normalizePath(rawRel);
        } catch {
          skippedBinary++;
          continue;
        }
        // Skip common noisy directories if user uploads an entire repo folder
        if (
          normalized.startsWith('node_modules/') ||
          normalized.includes('/node_modules/') ||
          normalized.startsWith('.git/') ||
          normalized.includes('/.git/')
        ) {
          continue;
        }
        try {
          const text = await file.text();
          if (text.includes('\u0000')) {
            skippedBinary++;
            continue;
          }
          nextFiles[normalized] = {
            path: normalized,
            content: text,
            language: detectLanguage(normalized),
            size: file.size,
            updatedAt: Date.now(),
            origin: 'uploaded',
          };
          lastAddedPath = normalized;
          addedCount++;
        } catch {
          skippedBinary++;
        }
      }

      if (addedCount > 0) {
        setFiles(nextFiles);
        if (lastAddedPath) {
          setSelectedFilePath(lastAddedPath);
          setDesktopInspectorOpen(true);
        }
        notify(
          skippedBinary > 0
            ? `${addedCount} file diunggah (${skippedBinary} biner/besar dilewati)`
            : `${addedCount} file berhasil ditambahkan ke workspace`
        );
      } else {
        notify('Tidak ada file teks/kode yang dapat dimuat.');
      }
    },
    [notify]
  );

  const handleCreateFile = useCallback(
    (rawPath: string, content: string): { ok: boolean; error?: string } => {
      try {
        const clean = normalizePath(rawPath);
        if (filesRef.current[clean]) {
          return { ok: false, error: `File "${clean}" sudah ada di workspace.` };
        }
        const now = Date.now();
        const created: WorkspaceFile = {
          path: clean,
          content,
          language: detectLanguage(clean),
          size: new TextEncoder().encode(content).length,
          updatedAt: now,
          origin: 'uploaded',
        };
        const snap: FileSnapshot = {
          id: `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
          path: clean,
          beforeContent: null,
          afterContent: content,
          timestamp: now,
          summary: `Membuat file ${clean}`,
        };
        setFiles((prev) => ({ ...prev, [clean]: created }));
        setSnapshots((prev) => [snap, ...prev]);
        setSelectedFilePath(clean);
        setDesktopInspectorOpen(true);
        notify(`File ${clean} dibuat`);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [notify]
  );

  const handleManualSaveFile = useCallback(
    (filePath: string, nextContent: string) => {
      const existing = filesRef.current[filePath];
      if (!existing) return;
      const now = Date.now();
      const snap: FileSnapshot = {
        id: `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
        path: filePath,
        beforeContent: existing.content,
        afterContent: nextContent,
        timestamp: now,
        summary: `Edit manual pada ${filePath}`,
      };
      setFiles((prev) => ({
        ...prev,
        [filePath]: {
          ...existing,
          content: nextContent,
          size: new TextEncoder().encode(nextContent).length,
          updatedAt: now,
        },
      }));
      setSnapshots((prev) => [snap, ...prev]);
      notify(`Perubahan ${filePath} disimpan`);
    },
    [notify]
  );

  const handleDeleteFile = useCallback(
    (filePath: string) => {
      const existing = filesRef.current[filePath];
      if (!existing) return;
      const now = Date.now();
      const snap: FileSnapshot = {
        id: `snap_${now}_${Math.random().toString(36).slice(2, 6)}`,
        path: filePath,
        beforeContent: existing.content,
        afterContent: null,
        timestamp: now,
        summary: `Menghapus file ${filePath}`,
      };
      setFiles((prev) => {
        const copy = { ...prev };
        delete copy[filePath];
        return copy;
      });
      setSnapshots((prev) => [snap, ...prev]);
      setSelectedFilePath((prev) => (prev === filePath ? null : prev));
      notify(`File ${filePath} dihapus`);
    },
    [notify]
  );

  const handleRevertSnapshot = useCallback(
    (snapshotId: string) => {
      const snap = snapshots.find((s) => s.id === snapshotId);
      if (!snap) return;

      setFiles((prev) => {
        const copy = { ...prev };
        if (snap.beforeContent === null) {
          delete copy[snap.path];
        } else {
          copy[snap.path] = {
            path: snap.path,
            content: snap.beforeContent,
            language: detectLanguage(snap.path),
            size: new TextEncoder().encode(snap.beforeContent).length,
            updatedAt: Date.now(),
            origin: prev[snap.path]?.origin || 'sample',
          };
        }
        return copy;
      });
      if (snap.beforeContent !== null) {
        setSelectedFilePath(snap.path);
      }
      notify(`Perubahan pada ${snap.path} dikembalikan (Undo)`);
    },
    [snapshots, notify]
  );

  const handleExportZip = useCallback(async () => {
    try {
      await exportWorkspaceAsZip(filesRef.current, settingsRef.current.workspaceName);
      notify(`Workspace diekspor sebagai ${settingsRef.current.workspaceName}.zip`);
    } catch {
      notify('Gagal mengekspor arsip ZIP.');
    }
  }, [notify]);

  const appendToolUpdate = useCallback((messageId: string, updatedCalls: ToolCallRecord[]) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, toolCalls: updatedCalls } : m))
    );
  }, []);

  const runAgentLoop = useCallback(
    async (nextHistory: GeminiContent[], stepCount: number) => {
      if (stepCount >= MAX_AGENT_STEPS) {
        setIsBusy(false);
        setBusyPhase('');
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `Batas langkah otomatis (${MAX_AGENT_STEPS} iterasi) tercapai. Kirim pesan lanjutan jika ingin meneruskan.`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      setIsBusy(true);
      setBusyPhase(
        settingsRef.current.highThinking
          ? 'Berpikir mendalam (High Thinking)...'
          : stepCount === 0
            ? 'Menganalisis permintaan...'
            : 'Melanjutkan langkah agent...'
      );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/agent/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: nextHistory,
            workspaceSummary: buildWorkspaceSummary(filesRef.current),
            rolePreset: settingsRef.current.rolePreset,
            highThinking: settingsRef.current.highThinking,
            permissionMode: settingsRef.current.permissionMode,
          }),
        });

        const payload = (await res.json()) as AgentStepResponse & { error?: string };

        if (!res.ok) {
          throw new Error(payload.error || `Server merespons status ${res.status}`);
        }

        const updatedHistory: GeminiContent[] = payload.rawModelContent
          ? [...nextHistory, payload.rawModelContent]
          : payload.text
            ? [...nextHistory, { role: 'model', parts: [{ text: payload.text }] }]
            : nextHistory;

        setModelHistory(updatedHistory);

        const messageId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const toolCallRecords: ToolCallRecord[] = (payload.functionCalls ?? []).map((fc) => ({
          id: fc.id,
          name: fc.name,
          args: fc.args,
          status: 'pending',
          diffPreview: buildToolDiffPreview(fc.name, fc.args, filesRef.current),
        }));

        const assistantMsg: TerminalMessage = {
          id: messageId,
          role: 'assistant',
          text: payload.text || '',
          thoughtSummary: payload.thoughtSummary || undefined,
          toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
          modelUsed: payload.modelUsed,
          highThinking: settingsRef.current.highThinking,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (toolCallRecords.length === 0) {
          setIsBusy(false);
          setBusyPhase('');
          return;
        }

        // Process tool calls sequentially, pausing if any requires user permission
        await processToolBatch({
          messageId,
          calls: toolCallRecords,
          currentIndex: 0,
          collectedResponses: [],
          historyBeforeResponses: updatedHistory,
          stepCount,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: 'Permintaan dihentikan oleh pengguna.',
              timestamp: Date.now(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: 'assistant',
              text: err instanceof Error ? err.message : String(err),
              timestamp: Date.now(),
              error: true,
            },
          ]);
        }
        setIsBusy(false);
        setBusyPhase('');
      } finally {
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const processToolBatch = useCallback(
    async (batch: PendingBatchState) => {
      let workingCalls = [...batch.calls];
      const collected = [...batch.collectedResponses];
      let idx = batch.currentIndex;

      while (idx < workingCalls.length) {
        const tc = workingCalls[idx];
        const needsAsk = requiresPermission(
          tc.name,
          settingsRef.current.permissionMode,
          settingsRef.current.askOnReadTools,
          trustedRef.current
        );

        if (needsAsk) {
          setPendingBatch({
            ...batch,
            calls: workingCalls,
            currentIndex: idx,
            collectedResponses: collected,
          });
          setBusyPhase(`Menunggu izin Anda untuk ${tc.name}...`);
          return;
        }

        setBusyPhase(`Menjalankan ${tc.name}...`);
        const outcome = executeWorkspaceTool(
          tc.name,
          tc.args,
          filesRef.current,
          scriptsRef.current,
          tc.id
        );

        filesRef.current = outcome.updatedFiles;
        scriptsRef.current = outcome.updatedScripts;
        setFiles(outcome.updatedFiles);
        setTermuxScripts(outcome.updatedScripts);

        if (outcome.snapshot) {
          setSnapshots((prev) => [outcome.snapshot!, ...prev]);
        }
        if (outcome.changedPath && outcome.updatedFiles[outcome.changedPath]) {
          setSelectedFilePath(outcome.changedPath);
        }
        if (outcome.createdScriptId) {
          notify('Skrip Termux baru disimpan ke tab Termux');
        }

        workingCalls = workingCalls.map((item, i) =>
          i === idx
            ? {
                ...item,
                status: outcome.isError ? 'error' : 'auto',
                result: outcome.result,
                snapshotId: outcome.snapshot?.id,
                executedAt: Date.now(),
              }
            : item
        );
        appendToolUpdate(batch.messageId, workingCalls);

        collected.push({
          functionResponse: {
            id: tc.id,
            name: tc.name,
            response: outcome.result,
          },
        });
        idx++;
      }

      setPendingBatch(null);
      const nextHistory: GeminiContent[] = [
        ...batch.historyBeforeResponses,
        { role: 'user', parts: collected },
      ];
      setModelHistory(nextHistory);
      await runAgentLoop(nextHistory, batch.stepCount + 1);
    },
    [appendToolUpdate, notify, runAgentLoop]
  );

  const handlePermissionDecision = useCallback(
    async (decision: 'once' | 'session' | 'deny') => {
      if (!pendingBatch) return;
      const batch = pendingBatch;
      const idx = batch.currentIndex;
      const tc = batch.calls[idx];

      if (decision === 'session') {
        const nextTrusted = [...trustedRef.current, '*'];
        trustedRef.current = nextTrusted;
        setSessionTrustedTools(nextTrusted);
      }

      let workingCalls = [...batch.calls];
      const collected = [...batch.collectedResponses];

      if (decision === 'deny') {
        const deniedResult = {
          denied: true,
          message: 'Pengguna menolak izin untuk menjalankan tool ini. Hormati keputusan ini.',
        };
        workingCalls = workingCalls.map((item, i) =>
          i === idx
            ? { ...item, status: 'denied', result: deniedResult, executedAt: Date.now() }
            : item
        );
        appendToolUpdate(batch.messageId, workingCalls);
        collected.push({
          functionResponse: {
            id: tc.id,
            name: tc.name,
            response: deniedResult,
          },
        });
      } else {
        const outcome = executeWorkspaceTool(
          tc.name,
          tc.args,
          filesRef.current,
          scriptsRef.current,
          tc.id
        );
        filesRef.current = outcome.updatedFiles;
        scriptsRef.current = outcome.updatedScripts;
        setFiles(outcome.updatedFiles);
        setTermuxScripts(outcome.updatedScripts);

        if (outcome.snapshot) {
          setSnapshots((prev) => [outcome.snapshot!, ...prev]);
        }
        if (outcome.changedPath && outcome.updatedFiles[outcome.changedPath]) {
          setSelectedFilePath(outcome.changedPath);
          setDesktopInspectorOpen(true);
        }
        if (outcome.createdScriptId) {
          notify('Skrip Termux baru disimpan ke tab Termux');
        }

        workingCalls = workingCalls.map((item, i) =>
          i === idx
            ? {
                ...item,
                status: outcome.isError ? 'error' : 'approved',
                result: outcome.result,
                snapshotId: outcome.snapshot?.id,
                executedAt: Date.now(),
              }
            : item
        );
        appendToolUpdate(batch.messageId, workingCalls);
        collected.push({
          functionResponse: {
            id: tc.id,
            name: tc.name,
            response: outcome.result,
          },
        });
      }

      setPendingBatch(null);
      await processToolBatch({
        ...batch,
        calls: workingCalls,
        currentIndex: idx + 1,
        collectedResponses: collected,
      });
    },
    [pendingBatch, appendToolUpdate, notify, processToolBatch]
  );

  const handleSendPrompt = useCallback(
    async (text: string, image?: ImageAttachment) => {
      if (isBusy || pendingBatch) return;

      const userMsg: TerminalMessage = {
        id: `usr_${Date.now()}`,
        role: 'user',
        text,
        image,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Fire background quick title generation on first user turn (gemini-3.1-flash-lite)
      if (messages.length === 0 && text.trim().length > 4) {
        fetch('/api/agent/quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'title', input: text }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.result) setSessionTitle(String(data.result).slice(0, 48));
          })
          .catch(() => {
            // Non-blocking background helper
          });
      }

      const userParts: GeminiPart[] = [];
      if (image?.base64) {
        userParts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        });
      }
      userParts.push({ text });

      const nextHistory: GeminiContent[] = [
        ...modelHistory,
        { role: 'user', parts: userParts },
      ];
      setModelHistory(nextHistory);
      await runAgentLoop(nextHistory, 0);
    },
    [isBusy, pendingBatch, messages.length, modelHistory, runAgentLoop]
  );

  const handleStopAgent = useCallback(() => {
    abortRef.current?.abort();
    setIsBusy(false);
    setBusyPhase('');
    setPendingBatch(null);
  }, []);

  const handleRunSlashCommand = useCallback(
    (cmd: string): boolean => {
      const normalized = cmd.trim().toLowerCase();
      if (normalized === '/files') {
        const summary = buildWorkspaceSummary(filesRef.current) || '(Workspace kosong)';
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `Daftar file di ${settingsRef.current.workspaceName}:\n${summary}`,
            timestamp: Date.now(),
          },
        ]);
        return true;
      }
      if (normalized === '/termux') {
        setActiveTab('termux');
        return true;
      }
      if (normalized === '/think') {
        const nextVal = !settingsRef.current.highThinking;
        updateSettings({ highThinking: nextVal });
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `Mode High Thinking ${nextVal ? 'diaktifkan (ThinkingLevel.HIGH)' : 'dimatikan (Penalaran Standar)'}.`,
            timestamp: Date.now(),
          },
        ]);
        return true;
      }
      if (normalized === '/mode') {
        const nextMode = settingsRef.current.permissionMode === 'ask' ? 'auto' : 'ask';
        updateSettings({ permissionMode: nextMode });
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `Mode perizinan diubah ke: ${nextMode === 'ask' ? 'Minta Izin Tiap Aksi' : 'Otomatis Penuh'}.`,
            timestamp: Date.now(),
          },
        ]);
        return true;
      }
      if (normalized === '/export') {
        void handleExportZip();
        return true;
      }
      if (normalized === '/clear') {
        setMessages([]);
        setModelHistory([]);
        setPendingBatch(null);
        setSessionTitle('Sesi Baru');
        notify('Riwayat terminal dibersihkan');
        return true;
      }
      return false;
    },
    [updateSettings, handleExportZip, notify]
  );

  const selectedFile = selectedFilePath ? files[selectedFilePath] ?? null : null;

  const pendingPermissionView = pendingBatch
    ? {
        messageId: pendingBatch.messageId,
        toolCall: pendingBatch.calls[pendingBatch.currentIndex],
      }
    : null;

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: 'terminal', label: 'Terminal', icon: <Terminal className="h-5 w-5" /> },
    { id: 'files', label: 'File', icon: <FolderCode className="h-5 w-5" /> },
    { id: 'termux', label: 'Termux', icon: <Smartphone className="h-5 w-5" /> },
    { id: 'settings', label: 'Setelan', icon: <Settings className="h-5 w-5" /> },
  ];

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#0B0E14] text-[#E7EDF6]">
      {/* Top Bar Contract: 1-row, 3 zones (Brand · Nav Links · Primary Action) */}
      <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-[#242E3F] bg-[#121721] px-4 lg:gap-8 lg:px-6">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('terminal')}
          className="font-display text-lg font-bold tracking-tight text-[#E7EDF6] whitespace-nowrap shrink-0"
        >
          Koda
        </button>

        {/* Zone 2: Clean single-line text nav links (Desktop) */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-3.5 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-[#E7EDF6]'
                    : 'text-[#8C99B0] hover:text-[#E7EDF6]'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#F09A3E]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Mobile quiet active session label */}
        <span className="truncate font-mono text-xs text-[#8C99B0] md:hidden">
          {activeTab === 'terminal'
            ? sessionTitle
            : activeTab === 'files'
              ? `${Object.keys(files).length} file`
              : activeTab === 'termux'
                ? 'Termux Bridge'
                : 'Setelan'}
        </span>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          {activeTab === 'terminal' ? (
            <>
              <button
                type="button"
                onClick={() => setDesktopInspectorOpen((prev) => !prev)}
                aria-label={desktopInspectorOpen ? 'Sembunyikan panel kode' : 'Tampilkan panel kode'}
                className="hidden lg:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap shrink-0"
              >
                <PanelRight className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                <span>{desktopInspectorOpen ? 'Tutup Kode' : 'Buka Kode'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportZip}
                aria-label="Ekspor proyek sebagai ZIP"
                className="inline-flex lg:hidden min-h-[38px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-2.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                <span>ZIP</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleExportZip}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#F09A3E] px-3.5 text-xs font-semibold text-[#0B0E14] transition-colors hover:bg-[#F5AE5F] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ekspor ZIP</span>
            </button>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main className="min-h-0 flex-1 overflow-hidden pb-[56px] md:pb-0">
        {activeTab === 'terminal' && (
          <div className="flex h-full min-h-0 w-full">
            {/* Desktop left sidebar: File Explorer */}
            <aside className="hidden lg:block w-[272px] shrink-0 border-r border-[#242E3F]">
              <FileExplorer
                files={files}
                snapshots={snapshots}
                selectedPath={selectedFilePath}
                onSelectFile={(p) => {
                  setSelectedFilePath(p);
                  setDesktopInspectorOpen(true);
                }}
                onUploadFiles={handleUploadFiles}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onRevertSnapshot={handleRevertSnapshot}
                onExportZip={handleExportZip}
              />
            </aside>

            {/* Center primary focal anchor: Agent Terminal Stream */}
            <section className="min-w-0 flex-1 h-full">
              <TerminalStream
                messages={messages}
                settings={settings}
                isBusy={isBusy}
                busyPhase={busyPhase}
                pendingPermission={pendingPermissionView}
                draftInput={draftInput}
                onDraftChange={setDraftInput}
                onSendPrompt={handleSendPrompt}
                onStopAgent={handleStopAgent}
                onPermissionDecision={handlePermissionDecision}
                onUpdateSettings={updateSettings}
                onOpenFile={(p) => {
                  setSelectedFilePath(p);
                  setDesktopInspectorOpen(true);
                  if (window.innerWidth < 1024) {
                    setActiveTab('files');
                  }
                }}
                onRevertSnapshot={handleRevertSnapshot}
                onRunSlashCommand={handleRunSlashCommand}
              />
            </section>

            {/* Desktop right inspector: Code Viewer & Editor */}
            {desktopInspectorOpen && (
              <aside className="hidden xl:block w-[420px] shrink-0 border-l border-[#242E3F]">
                <CodeInspector
                  file={selectedFile}
                  onSaveContent={handleManualSaveFile}
                  onAskAgentAboutFile={(p) => {
                    setDraftInput(`Tinjau file ${p} dan jelaskan bagian penting atau potensi bug-nya.`);
                  }}
                  onClose={() => setDesktopInspectorOpen(false)}
                />
              </aside>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[290px_1fr]">
            <div className="h-full min-h-0 border-b border-[#242E3F] md:border-b-0 md:border-r">
              <FileExplorer
                files={files}
                snapshots={snapshots}
                selectedPath={selectedFilePath}
                onSelectFile={(p) => setSelectedFilePath(p)}
                onUploadFiles={handleUploadFiles}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onRevertSnapshot={handleRevertSnapshot}
                onExportZip={handleExportZip}
              />
            </div>
            <div className="min-h-0 h-full overflow-hidden">
              <CodeInspector
                file={selectedFile}
                onSaveContent={handleManualSaveFile}
                onAskAgentAboutFile={(p) => {
                  setDraftInput(`Tinjau file ${p} dan bantu perbaiki atau optimalkan kodenya.`);
                  setActiveTab('terminal');
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'termux' && (
          <TermuxStudio
            scripts={termuxScripts}
            onAddScript={(data) => {
              const newScript: TermuxScript = {
                ...data,
                id: `termux_${Date.now()}`,
                createdAt: Date.now(),
                origin: 'agent',
              };
              setTermuxScripts((prev) => [newScript, ...prev]);
              notify(`Skrip "${newScript.title}" disimpan`);
            }}
            onDeleteScript={(id) => {
              setTermuxScripts((prev) => prev.filter((s) => s.id !== id));
              notify('Skrip Termux dihapus');
            }}
            onAskAgentModify={(script) => {
              setDraftInput(
                `Modifikasi skrip Termux "${script.title}" berikut agar lebih tangguh dan simpan hasilnya lewat save_termux_script:\n\n\`\`\`bash\n${script.scriptBody}\n\`\`\``
              );
              setActiveTab('terminal');
            }}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            sessionTrustedTools={sessionTrustedTools}
            fileCount={Object.keys(files).length}
            messageCount={messages.length}
            onUpdateSettings={updateSettings}
            onResetTrustedTools={() => {
              setSessionTrustedTools([]);
              notify('Izin sesi otomatis telah dicabut');
            }}
            onClearChat={() => {
              setMessages([]);
              setModelHistory([]);
              setPendingBatch(null);
              setSessionTitle('Sesi Baru');
              notify('Riwayat terminal dibersihkan');
            }}
            onResetWorkspace={() => {
              const reset = createInitialState();
              setFiles(reset.files);
              setSnapshots([]);
              setTermuxScripts(reset.termuxScripts);
              setMessages([]);
              setModelHistory([]);
              setSettings(reset.settings);
              setSessionTitle(reset.sessionTitle);
              setSessionTrustedTools([]);
              setSelectedFilePath('src/calculator.ts');
              notify('Workspace dikembalikan ke proyek demo');
            }}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (height 56px; top 52px + bottom 56px = 108px <= 15% of 844px) */}
      <nav
        aria-label="Navigasi bawah mobile"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-[56px] grid-cols-4 items-center border-t border-[#242E3F] bg-[#121721]/95 backdrop-blur-md pb-safe md:hidden"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-[#F09A3E]' : 'text-[#8C99B0] hover:text-[#E7EDF6]'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-16 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#F59E0B]/50 bg-[#18202D] px-3.5 py-2 text-xs font-medium text-[#FDE6C4] shadow-lg md:bottom-4"
        >
          <WifiOff className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
          <span>Mode Offline — File lokal tetap dapat dilihat dan diedit</span>
        </div>
      )}

      {/* Transient Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 right-4 z-50 rounded-lg border border-[#242E3F] bg-[#18202D] px-3.5 py-2.5 text-xs font-medium text-[#E7EDF6] shadow-xl md:bottom-4"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
