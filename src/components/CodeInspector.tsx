import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  MessageSquareCode,
  Save,
  X,
} from 'lucide-react';
import type { WorkspaceFile } from '../types/agent';
import { downloadTextFile } from '../utils/storage';
import { formatBytes } from '../utils/workspaceTools';

interface CodeInspectorProps {
  file: WorkspaceFile | null;
  onSaveContent: (path: string, content: string) => void;
  onAskAgentAboutFile: (path: string) => void;
  onClose?: () => void;
}

export const CodeInspector: React.FC<CodeInspectorProps> = ({
  file,
  onSaveContent,
  onAskAgentAboutFile,
  onClose,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setDraft(file?.content ?? '');
  }, [file?.path, file?.updatedAt]);

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#0B0E14] p-6 text-center">
        <p className="font-display text-sm font-semibold text-[#C9D4E6]">
          Pilih file untuk melihat atau mengedit kode
        </p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[#8C99B0]">
          Klik salah satu file di Workspace Lokal atau unggah folder proyek dari perangkat Anda.
        </p>
      </div>
    );
  }

  const lines = file.content.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const handleSave = () => {
    onSaveContent(file.path, draft);
    setIsEditing(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#0B0E14]">
      {/* File header bar */}
      <div className="flex items-center justify-between gap-2 border-b border-[#242E3F] bg-[#121721] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold text-[#E7EDF6]">
            {file.path}
          </p>
          <p className="mt-0.5 truncate whitespace-nowrap font-mono text-[11px] text-[#8C99B0]">
            {file.language} · {lines.length} baris · {formatBytes(file.size)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#F09A3E] px-3 text-xs font-semibold text-[#0B0E14] hover:bg-[#F5AE5F] whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Simpan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(file.content);
                  setIsEditing(false);
                }}
                aria-label="Batalkan edit file"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label={`Edit manual ${file.path}`}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-2.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap"
              >
                <Edit3 className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={`Salin isi ${file.path}`}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-[#22C55E]" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(file.path.split('/').pop() || 'file.txt', file.content)
                }
                aria-label={`Unduh file ${file.path}`}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
              >
                <Download className="h-4 w-4" />
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup panel kode"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Code content / editor */}
      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Editor kode untuk ${file.path}`}
            spellCheck={false}
            className="h-full min-h-[320px] w-full resize-none bg-[#0B0E14] p-4 font-mono text-xs leading-6 text-[#E7EDF6] focus:outline-none"
          />
        ) : (
          <div className="min-w-max py-3 font-mono text-xs leading-6">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="flex px-4 hover:bg-[#121721]"
              >
                <span className="mr-4 w-8 shrink-0 select-none text-right text-[#556178]">
                  {idx + 1}
                </span>
                <span className="whitespace-pre text-[#D8E1F0]">{line || ' '}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contextual footer action */}
      <div className="border-t border-[#242E3F] bg-[#121721] px-4 py-2.5">
        <button
          type="button"
          onClick={() => onAskAgentAboutFile(file.path)}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#F09A3E]/60 hover:text-[#FDE6C4]"
        >
          <MessageSquareCode className="h-4 w-4 text-[#F09A3E]" aria-hidden="true" />
          <span>Tanya Koda tentang file ini</span>
        </button>
      </div>
    </div>
  );
};
