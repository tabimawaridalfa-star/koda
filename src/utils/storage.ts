import JSZip from 'jszip';
import type {
  AgentSettings,
  FileSnapshot,
  GeminiContent,
  TerminalMessage,
  TermuxScript,
  WorkspaceFile,
} from '../types/agent';
import { SEED_TERMUX_SCRIPTS, SEED_WORKSPACE_FILES } from '../data/seedWorkspace';

export interface PersistedAppState {
  files: Record<string, WorkspaceFile>;
  snapshots: FileSnapshot[];
  termuxScripts: TermuxScript[];
  messages: TerminalMessage[];
  modelHistory: GeminiContent[];
  settings: AgentSettings;
  sessionTitle: string;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  permissionMode: 'ask',
  askOnReadTools: false,
  highThinking: false,
  rolePreset: 'coder',
  workspaceName: 'proyek-koda',
};

const DB_NAME = 'koda-agent-db';
const STORE_NAME = 'workspace';
const STATE_KEY = 'primary-state-v1';
const LS_FALLBACK_KEY = 'koda-agent-state-v1';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function createInitialState(): PersistedAppState {
  return {
    files: { ...SEED_WORKSPACE_FILES },
    snapshots: [],
    termuxScripts: [...SEED_TERMUX_SCRIPTS],
    messages: [],
    modelHistory: [],
    settings: { ...DEFAULT_SETTINGS },
    sessionTitle: 'Sesi Baru',
  };
}

export async function loadPersistedState(): Promise<PersistedAppState> {
  const fallback = createInitialState();
  try {
    const db = await openDatabase();
    if (db) {
      const saved = await new Promise<PersistedAppState | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
        req.onsuccess = () => resolve((req.result as PersistedAppState) || null);
        req.onerror = () => resolve(null);
      });
      if (saved && saved.files && saved.settings) {
        return {
          ...fallback,
          ...saved,
          settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        };
      }
    }
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
      if (parsed && parsed.files) {
        return {
          ...fallback,
          ...parsed,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        };
      }
    }
  } catch {
    // Ignore storage parse failure
  }

  return fallback;
}

export async function savePersistedState(state: PersistedAppState): Promise<void> {
  // Strip base64 image payloads from persisted messages only if state gets very large
  const safeState: PersistedAppState = {
    ...state,
    messages: state.messages.slice(-80),
    snapshots: state.snapshots.slice(0, 60),
  };

  try {
    const db = await openDatabase();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(safeState, STATE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      return;
    }
  } catch {
    // Fallback to localStorage
  }

  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(safeState));
  } catch {
    // Quota exceeded — ignore gracefully
  }
}

export async function exportWorkspaceAsZip(
  files: Record<string, WorkspaceFile>,
  workspaceName: string
): Promise<void> {
  const zip = new JSZip();
  for (const file of Object.values(files)) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerFileDownload(blob, `${workspaceName || 'koda-workspace'}.zip`);
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  triggerFileDownload(blob, filename);
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
