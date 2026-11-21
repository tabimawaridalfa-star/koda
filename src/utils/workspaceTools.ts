import type {
  FileSnapshot,
  PermissionMode,
  TermuxCategory,
  TermuxScript,
  WorkspaceFile,
} from '../types/agent';

export const READ_ONLY_TOOLS = new Set(['list_files', 'read_file', 'search_files']);

export function normalizePath(rawPath: string): string {
  const cleaned = rawPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');

  if (!cleaned) {
    throw new Error('Path file tidak boleh kosong.');
  }
  const segments = cleaned.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`Path file tidak valid: "${rawPath}"`);
  }
  return cleaned;
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    py: 'python',
    html: 'html',
    css: 'css',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    txt: 'text',
    env: 'dotenv',
    kt: 'kotlin',
    java: 'java',
    go: 'go',
    rs: 'rust',
  };
  return map[ext] || 'text';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface UnifiedDiffResult {
  diffText: string;
  added: number;
  removed: number;
}

export function computeUnifiedDiff(
  before: string | null,
  after: string | null,
  filePath: string
): UnifiedDiffResult {
  const oldLines = before === null ? [] : before.split('\n');
  const newLines = after === null ? [] : after.split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // Guard huge files from quadratic DP blowup
  if (n * m > 180_000) {
    const out: string[] = [
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -1,${n} +1,${m} @@`,
      ...oldLines.slice(0, 60).map((l) => `-${l}`),
      ...newLines.slice(0, 60).map((l) => `+${l}`),
    ];
    return {
      diffText: out.join('\n'),
      added: m,
      removed: n,
    };
  }

  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  type Op = { kind: 'same' | 'del' | 'add'; text: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: 'same', text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', text: oldLines[i] });
      i++;
    } else {
      ops.push({ kind: 'add', text: newLines[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: 'del', text: oldLines[i++] });
  }
  while (j < m) {
    ops.push({ kind: 'add', text: newLines[j++] });
  }

  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === 'add') added++;
    if (op.kind === 'del') removed++;
  }

  if (added === 0 && removed === 0) {
    return { diffText: `--- a/${filePath}\n+++ b/${filePath}\n(Tidak ada perubahan baris)`, added: 0, removed: 0 };
  }

  // Keep changed lines plus 2 lines of context
  const include = new Array<boolean>(ops.length).fill(false);
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].kind !== 'same') {
      for (let c = Math.max(0, k - 2); c <= Math.min(ops.length - 1, k + 2); c++) {
        include[c] = true;
      }
    }
  }

  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let skipping = false;
  for (let k = 0; k < ops.length; k++) {
    if (!include[k]) {
      if (!skipping && lines.length > 2) {
        lines.push('@@ ... @@');
      }
      skipping = true;
      continue;
    }
    skipping = false;
    const prefix = ops[k].kind === 'add' ? '+' : ops[k].kind === 'del' ? '-' : ' ';
    lines.push(`${prefix}${ops[k].text}`);
  }

  return {
    diffText: lines.join('\n'),
    added,
    removed,
  };
}

export function requiresPermission(
  toolName: string,
  mode: PermissionMode,
  askOnReadTools: boolean,
  sessionTrustedTools: string[]
): boolean {
  if (mode === 'auto') return false;
  if (sessionTrustedTools.includes('*') || sessionTrustedTools.includes(toolName)) {
    return false;
  }
  if (READ_ONLY_TOOLS.has(toolName)) {
    return askOnReadTools;
  }
  return true;
}

export function buildToolDiffPreview(
  toolName: string,
  args: Record<string, unknown>,
  files: Record<string, WorkspaceFile>
): string | undefined {
  try {
    if (toolName === 'write_file') {
      const path = normalizePath(String(args.path ?? ''));
      const content = String(args.content ?? '');
      const existing = files[path]?.content ?? null;
      return computeUnifiedDiff(existing, content, path).diffText;
    }
    if (toolName === 'edit_file') {
      const path = normalizePath(String(args.path ?? ''));
      const existing = files[path];
      if (!existing) return `File belum ada: ${path}`;
      const oldText = String(args.oldText ?? '');
      const newText = String(args.newText ?? '');
      if (!existing.content.includes(oldText)) {
        return `Peringatan: teks lama tidak cocok persis di ${path}.`;
      }
      const next = existing.content.replace(oldText, newText);
      return computeUnifiedDiff(existing.content, next, path).diffText;
    }
    if (toolName === 'delete_file') {
      const path = normalizePath(String(args.path ?? ''));
      const existing = files[path];
      if (!existing) return undefined;
      return computeUnifiedDiff(existing.content, null, path).diffText;
    }
    if (toolName === 'save_termux_script') {
      const scriptBody = String(args.scriptBody ?? '');
      const title = String(args.title ?? 'termux-script.sh');
      return computeUnifiedDiff(null, scriptBody, `termux/${title}`).diffText;
    }
    if (toolName === 'run_js_snippet') {
      return String(args.code ?? '');
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function runJsSnippetSafe(code: string): { ok: boolean; logs: string[]; returnValue?: string; error?: string } {
  const logs: string[] = [];
  const fakeConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatRuntimeValue).join(' ')),
    warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(formatRuntimeValue).join(' ')}`),
    error: (...args: unknown[]) => logs.push(`[error] ${args.map(formatRuntimeValue).join(' ')}`),
  };

  try {
    const fn = new Function('console', `"use strict";\n${code}`);
    const value = fn(fakeConsole);
    return {
      ok: true,
      logs,
      returnValue: value === undefined ? undefined : formatRuntimeValue(value),
    };
  } catch (err) {
    return {
      ok: false,
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatRuntimeValue(val: unknown): string {
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export interface ToolExecutionOutcome {
  result: Record<string, unknown>;
  updatedFiles: Record<string, WorkspaceFile>;
  updatedScripts: TermuxScript[];
  snapshot?: FileSnapshot;
  changedPath?: string;
  createdScriptId?: string;
  isError?: boolean;
}

export function executeWorkspaceTool(
  toolName: string,
  args: Record<string, unknown>,
  files: Record<string, WorkspaceFile>,
  termuxScripts: TermuxScript[],
  toolCallId?: string
): ToolExecutionOutcome {
  const now = Date.now();

  if (toolName === 'list_files') {
    const prefix = typeof args.filterPrefix === 'string' ? args.filterPrefix.trim() : '';
    const list = Object.values(files)
      .filter((f) => (!prefix ? true : f.path.startsWith(prefix)))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({
        path: f.path,
        language: f.language,
        size: f.size,
        lines: f.content.split('\n').length,
        origin: f.origin,
      }));
    return {
      result: { count: list.length, files: list },
      updatedFiles: files,
      updatedScripts: termuxScripts,
    };
  }

  if (toolName === 'read_file') {
    try {
      const targetPath = normalizePath(String(args.path ?? ''));
      const file = files[targetPath];
      if (!file) {
        return {
          result: { error: `File "${targetPath}" tidak ditemukan di workspace.` },
          updatedFiles: files,
          updatedScripts: termuxScripts,
          isError: true,
        };
      }
      const allLines = file.content.split('\n');
      const start = Math.max(1, Number(args.startLine || 1));
      const end = Math.min(allLines.length, Number(args.endLine || allLines.length));
      const slice = allLines
        .slice(start - 1, end)
        .map((line, idx) => `${start + idx}: ${line}`)
        .join('\n');
      return {
        result: {
          path: file.path,
          totalLines: allLines.length,
          range: `${start}-${end}`,
          content: slice,
        },
        updatedFiles: files,
        updatedScripts: termuxScripts,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        updatedFiles: files,
        updatedScripts: termuxScripts,
        isError: true,
      };
    }
  }

  if (toolName === 'search_files') {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        result: { error: 'Query pencarian tidak boleh kosong.' },
        updatedFiles: files,
        updatedScripts: termuxScripts,
        isError: true,
      };
    }
    const isRegex = Boolean(args.isRegex);
    let regex: RegExp | null = null;
    if (isRegex) {
      try {
        regex = new RegExp(query, 'i');
      } catch (err) {
        return {
          result: { error: `Regex tidak valid: ${err instanceof Error ? err.message : String(err)}` },
          updatedFiles: files,
          updatedScripts: termuxScripts,
          isError: true,
        };
      }
    }

    const matches: Array<{ path: string; line: number; preview: string }> = [];
    const lowerQuery = query.toLowerCase();

    for (const file of Object.values(files).sort((a, b) => a.path.localeCompare(b.path))) {
      const lines = file.content.split('\n');
      lines.forEach((line, idx) => {
        const hit = regex ? regex.test(line) : line.toLowerCase().includes(lowerQuery);
        if (hit && matches.length < 60) {
          matches.push({
            path: file.path,
            line: idx + 1,
            preview: line.trim().slice(0, 160),
          });
        }
      });
    }

    return {
      result: { query, matchCount: matches.length, matches },
      updatedFiles: files,
      updatedScripts: termuxScripts,
    };
  }

  if (toolName === 'write_file') {
    try {
      const targetPath = normalizePath(String(args.path ?? ''));
      const content = String(args.content ?? '');
      const summary = String(args.summary ?? `Menulis ${targetPath}`);
      const prev = files[targetPath]?.content ?? null;
      const diff = computeUnifiedDiff(prev, content, targetPath);

      const nextFile: WorkspaceFile = {
        path: targetPath,
        content,
        language: detectLanguage(targetPath),
        size: new TextEncoder().encode(content).length,
        updatedAt: now,
        origin: 'agent',
      };

      const snapshot: FileSnapshot = {
        id: `snap_${now}_${Math.random().toString(36).slice(2, 7)}`,
        path: targetPath,
        beforeContent: prev,
        afterContent: content,
        timestamp: now,
        summary,
        toolCallId,
      };

      return {
        result: {
          ok: true,
          path: targetPath,
          action: prev === null ? 'created' : 'overwritten',
          addedLines: diff.added,
          removedLines: diff.removed,
          summary,
        },
        updatedFiles: { ...files, [targetPath]: nextFile },
        updatedScripts: termuxScripts,
        snapshot,
        changedPath: targetPath,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        updatedFiles: files,
        updatedScripts: termuxScripts,
        isError: true,
      };
    }
  }

  if (toolName === 'edit_file') {
    try {
      const targetPath = normalizePath(String(args.path ?? ''));
      const existing = files[targetPath];
      if (!existing) {
        return {
          result: { error: `File "${targetPath}" tidak ditemukan. Gunakan write_file untuk membuat file baru.` },
          updatedFiles: files,
          updatedScripts: termuxScripts,
          isError: true,
        };
      }
      const oldText = String(args.oldText ?? '');
      const newText = String(args.newText ?? '');
      const summary = String(args.summary ?? `Mengedit ${targetPath}`);

      if (!oldText || !existing.content.includes(oldText)) {
        return {
          result: {
            error: `Teks lama (oldText) tidak ditemukan secara persis di "${targetPath}". Baca ulang file dengan read_file terlebih dahulu.`,
          },
          updatedFiles: files,
          updatedScripts: termuxScripts,
          isError: true,
        };
      }

      const nextContent = existing.content.replace(oldText, newText);
      const diff = computeUnifiedDiff(existing.content, nextContent, targetPath);
      const nextFile: WorkspaceFile = {
        ...existing,
        content: nextContent,
        size: new TextEncoder().encode(nextContent).length,
        updatedAt: now,
        origin: 'agent',
      };

      const snapshot: FileSnapshot = {
        id: `snap_${now}_${Math.random().toString(36).slice(2, 7)}`,
        path: targetPath,
        beforeContent: existing.content,
        afterContent: nextContent,
        timestamp: now,
        summary,
        toolCallId,
      };

      return {
        result: {
          ok: true,
          path: targetPath,
          addedLines: diff.added,
          removedLines: diff.removed,
          summary,
        },
        updatedFiles: { ...files, [targetPath]: nextFile },
        updatedScripts: termuxScripts,
        snapshot,
        changedPath: targetPath,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        updatedFiles: files,
        updatedScripts: termuxScripts,
        isError: true,
      };
    }
  }

  if (toolName === 'delete_file') {
    try {
      const targetPath = normalizePath(String(args.path ?? ''));
      const existing = files[targetPath];
      if (!existing) {
        return {
          result: { error: `File "${targetPath}" tidak ditemukan.` },
          updatedFiles: files,
          updatedScripts: termuxScripts,
          isError: true,
        };
      }
      const reason = String(args.reason ?? `Menghapus ${targetPath}`);
      const nextFiles = { ...files };
      delete nextFiles[targetPath];

      const snapshot: FileSnapshot = {
        id: `snap_${now}_${Math.random().toString(36).slice(2, 7)}`,
        path: targetPath,
        beforeContent: existing.content,
        afterContent: null,
        timestamp: now,
        summary: reason,
        toolCallId,
      };

      return {
        result: { ok: true, deletedPath: targetPath, reason },
        updatedFiles: nextFiles,
        updatedScripts: termuxScripts,
        snapshot,
        changedPath: targetPath,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        updatedFiles: files,
        updatedScripts: termuxScripts,
        isError: true,
      };
    }
  }

  if (toolName === 'run_js_snippet') {
    const code = String(args.code ?? '');
    const run = runJsSnippetSafe(code);
    return {
      result: {
        ok: run.ok,
        logs: run.logs,
        returnValue: run.returnValue,
        error: run.error,
      },
      updatedFiles: files,
      updatedScripts: termuxScripts,
      isError: !run.ok,
    };
  }

  if (toolName === 'save_termux_script') {
    const validCategories: TermuxCategory[] = ['file', 'device', 'dev', 'network'];
    const rawCat = String(args.category ?? 'dev').toLowerCase() as TermuxCategory;
    const category: TermuxCategory = validCategories.includes(rawCat) ? rawCat : 'dev';
    const packages = Array.isArray(args.packages)
      ? args.packages.map((p) => String(p)).filter(Boolean)
      : [];
    const title = String(args.title ?? 'Skrip Termux Baru').trim();
    const description = String(args.description ?? '').trim();
    const command = String(args.command ?? 'bash script.sh').trim();
    const scriptBody = String(args.scriptBody ?? '').trim();

    const id = `termux_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const newScript: TermuxScript = {
      id,
      title,
      description,
      category,
      packages,
      command,
      scriptBody,
      createdAt: now,
      origin: 'agent',
    };

    return {
      result: {
        ok: true,
        scriptId: id,
        title,
        category,
        savedTo: 'Termux Studio',
      },
      updatedFiles: files,
      updatedScripts: [newScript, ...termuxScripts],
      createdScriptId: id,
    };
  }

  return {
    result: { error: `Tool tidak dikenal: "${toolName}"` },
    updatedFiles: files,
    updatedScripts: termuxScripts,
    isError: true,
  };
}

export function buildWorkspaceSummary(files: Record<string, WorkspaceFile>): string {
  const entries = Object.values(files).sort((a, b) => a.path.localeCompare(b.path));
  if (entries.length === 0) return '';
  return entries
    .slice(0, 80)
    .map((f) => `- ${f.path} (${f.language}, ${f.content.split('\n').length} baris, ${formatBytes(f.size)})`)
    .join('\n');
}
