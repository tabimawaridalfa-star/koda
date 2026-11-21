import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileCode2,
  FilePlus2,
  FolderUp,
  History,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { FileSnapshot, WorkspaceFile } from '../types/agent';
import { formatBytes } from '../utils/workspaceTools';

interface FileExplorerProps {
  files: Record<string, WorkspaceFile>;
  snapshots: FileSnapshot[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onUploadFiles: (fileList: FileList) => Promise<void>;
  onCreateFile: (path: string, content: string) => { ok: boolean; error?: string };
  onDeleteFile: (path: string) => void;
  onRevertSnapshot: (snapshotId: string) => void;
  onExportZip: () => Promise<void>;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  snapshots,
  selectedPath,
  onSelectFile,
  onUploadFiles,
  onCreateFile,
  onDeleteFile,
  onRevertSnapshot,
  onExportZip,
}) => {
  const [search, setSearch] = useState('');
  const [subView, setSubView] = useState<'files' | 'history'>('files');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const sortedFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(files)
      .filter((f) => (!q ? true : f.path.toLowerCase().includes(q)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files, search]);

  const totalSize = useMemo(
    () => Object.values(files).reduce((acc, f) => acc + f.size, 0),
    [files]
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newPath.trim()) {
      setFormError('Masukkan path file, misalnya src/helper.ts');
      return;
    }
    const res = onCreateFile(newPath.trim(), newContent);
    if (!res.ok) {
      setFormError(res.error || 'Gagal membuat file.');
      return;
    }
    setNewPath('');
    setNewContent('');
    setShowNewForm(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#121721]">
      {/* Hidden native pickers */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Pilih file lokal untuk diunggah"
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            await onUploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported on Chromium/Android/Desktop browsers
        webkitdirectory=""
        directory=""
        className="hidden"
        aria-label="Pilih folder lokal untuk diunggah"
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            await onUploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Top explorer controls */}
      <div className="border-b border-[#242E3F] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#E7EDF6]">
              Workspace Lokal
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-[#8C99B0]">
              {Object.keys(files).length} file · {formatBytes(totalSize)}
            </p>
          </div>
          <button
            type="button"
            onClick={onExportZip}
            aria-label="Ekspor seluruh workspace ke ZIP"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-2.5 py-1.5 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#F09A3E]/60 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
            <span>ZIP</span>
          </button>
        </div>

        {/* Action row */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-1.5 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#36445C] hover:bg-[#18202D] whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5 shrink-0 text-[#F09A3E]" aria-hidden="true" />
            <span>File</span>
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-1.5 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#36445C] hover:bg-[#18202D] whitespace-nowrap"
          >
            <FolderUp className="h-3.5 w-3.5 shrink-0 text-[#F09A3E]" aria-hidden="true" />
            <span>Folder</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewForm((prev) => !prev);
              setFormError(null);
            }}
            className="flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-1.5 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#36445C] hover:bg-[#18202D] whitespace-nowrap"
          >
            <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-[#F09A3E]" aria-hidden="true" />
            <span>Baru</span>
          </button>
        </div>

        {/* Segmented switch: Files vs Snapshots */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-[#0B0E14] p-1">
          <button
            type="button"
            onClick={() => setSubView('files')}
            className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subView === 'files'
                ? 'bg-[#18202D] text-[#E7EDF6]'
                : 'text-[#8C99B0] hover:text-[#E7EDF6]'
            }`}
          >
            Daftar File
          </button>
          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subView === 'history'
                ? 'bg-[#18202D] text-[#E7EDF6]'
                : 'text-[#8C99B0] hover:text-[#E7EDF6]'
            }`}
          >
            Riwayat ({snapshots.length})
          </button>
        </div>
      </div>

      {/* Inline create new file form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="border-b border-[#242E3F] bg-[#18202D]/60 p-3.5 space-y-2.5"
        >
          <div>
            <label
              htmlFor="new-file-path"
              className="block text-xs font-medium text-[#C9D4E6]"
            >
              Path file baru
            </label>
            <input
              id="new-file-path"
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="contoh: src/notes.ts"
              className="mt-1 w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 font-mono text-xs text-[#E7EDF6] placeholder:text-[#5C6880]"
            />
          </div>
          <div>
            <label
              htmlFor="new-file-content"
              className="block text-xs font-medium text-[#C9D4E6]"
            >
              Isi awal (opsional)
            </label>
            <textarea
              id="new-file-content"
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Tulis kode atau catatan..."
              className="mt-1 w-full rounded-lg border border-[#242E3F] bg-[#0B0E14] p-2.5 font-mono text-xs text-[#E7EDF6] placeholder:text-[#5C6880]"
            />
          </div>
          {formError && (
            <p role="alert" className="text-xs text-[#FCA5A5]">
              {formError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="min-h-[38px] rounded-lg px-3 text-xs font-medium text-[#8C99B0] hover:text-[#E7EDF6]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="min-h-[38px] rounded-lg bg-[#F09A3E] px-3.5 text-xs font-semibold text-[#0B0E14] hover:bg-[#F5AE5F]"
            >
              Simpan File
            </button>
          </div>
        </form>
      )}

      {subView === 'files' ? (
        <>
          {/* Filter search */}
          <div className="border-b border-[#242E3F] px-3.5 py-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#697791]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Cari file di workspace"
                placeholder="Filter file..."
                className="w-full min-h-[38px] rounded-lg border border-[#242E3F] bg-[#0B0E14] pl-8 pr-3 text-xs text-[#E7EDF6] placeholder:text-[#697791]"
              />
            </div>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1D2534]">
            {sortedFiles.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-[#C9D4E6]">
                  {search ? 'Tidak ada file yang cocok' : 'Workspace masih kosong'}
                </p>
                <p className="mt-1 text-xs text-[#8C99B0]">
                  {search
                    ? 'Coba kata kunci lain untuk menyaring daftar.'
                    : 'Unggah file atau folder dari perangkat Anda untuk mulai bekerja.'}
                </p>
              </div>
            ) : (
              sortedFiles.map((file) => {
                const isSelected = file.path === selectedPath;
                const isConfirming = confirmDeletePath === file.path;

                return (
                  <div
                    key={file.path}
                    className={`flex items-center justify-between gap-1 px-2.5 py-1 transition-colors ${
                      isSelected ? 'bg-[#18202D]' : 'hover:bg-[#151C27]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectFile(file.path)}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 px-1.5 text-left"
                    >
                      <FileCode2
                        className={`h-4 w-4 shrink-0 ${
                          isSelected ? 'text-[#F09A3E]' : 'text-[#697791]'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate font-mono text-xs ${
                            isSelected ? 'font-medium text-[#E7EDF6]' : 'text-[#C9D4E6]'
                          }`}
                        >
                          {file.path}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#697791]">
                          {file.language} · {formatBytes(file.size)}
                          {file.origin === 'agent' ? ' · diedit agent' : ''}
                          {file.origin === 'uploaded' ? ' · unggahan' : ''}
                        </p>
                      </div>
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteFile(file.path);
                            setConfirmDeletePath(null);
                          }}
                          className="min-h-[34px] rounded-md bg-[#EF4444]/20 px-2 text-[11px] font-medium text-[#FCA5A5] hover:bg-[#EF4444]/30"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePath(null)}
                          className="min-h-[34px] rounded-md px-2 text-[11px] text-[#8C99B0] hover:text-[#E7EDF6]"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePath(file.path)}
                        aria-label={`Hapus file ${file.path}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#697791] transition-colors hover:bg-[#0B0E14] hover:text-[#FCA5A5]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-[#1D2534]">
          {snapshots.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <History className="mx-auto h-6 w-6 text-[#5C6880]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#C9D4E6]">
                Belum ada riwayat perubahan
              </p>
              <p className="mt-1 text-xs text-[#8C99B0]">
                Setiap editan oleh agent atau manual otomatis dicatat di sini agar bisa dikembalikan (Undo).
              </p>
            </div>
          ) : (
            snapshots.map((snap) => (
              <div key={snap.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium text-[#E7EDF6]">
                      {snap.path}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8C99B0]">{snap.summary}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#697791]">
                      {new Date(snap.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ·{' '}
                      {snap.beforeContent === null
                        ? 'File baru'
                        : snap.afterContent === null
                          ? 'File dihapus'
                          : 'Dimodifikasi'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevertSnapshot(snap.id)}
                    aria-label={`Kembalikan perubahan pada ${snap.path}`}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-2.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                    <span>Undo</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
