import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { TermuxCategory, TermuxScript } from '../types/agent';
import { downloadTextFile } from '../utils/storage';

interface TermuxStudioProps {
  scripts: TermuxScript[];
  onAddScript: (script: Omit<TermuxScript, 'id' | 'createdAt' | 'origin'>) => void;
  onDeleteScript: (id: string) => void;
  onAskAgentModify: (script: TermuxScript) => void;
  onNotify: (msg: string) => void;
}

const CATEGORY_LABELS: Record<'all' | TermuxCategory, string> = {
  all: 'Semua',
  file: 'File & Storage',
  device: 'Perangkat',
  dev: 'Developer',
  network: 'Git & Jaringan',
};

export const TermuxStudio: React.FC<TermuxStudioProps> = ({
  scripts,
  onAddScript,
  onDeleteScript,
  onAskAgentModify,
  onNotify,
}) => {
  const [filter, setFilter] = useState<'all' | TermuxCategory>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TermuxCategory>('file');
  const [packages, setPackages] = useState('termux-api');
  const [command, setCommand] = useState('');
  const [scriptBody, setScriptBody] = useState(
    '#!/data/data/com.termux/files/usr/bin/bash\nset -euo pipefail\n\necho "Halo dari Termux"'
  );
  const [formError, setFormError] = useState<string | null>(null);

  const visibleScripts = useMemo(
    () => scripts.filter((s) => (filter === 'all' ? true : s.category === filter)),
    [scripts, filter]
  );

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify(`${label} disalin ke clipboard`);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      onNotify('Tidak dapat mengakses clipboard browser');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !scriptBody.trim()) {
      setFormError('Judul dan isi skrip wajib diisi.');
      return;
    }
    onAddScript({
      title: title.trim(),
      description: description.trim() || 'Skrip otomasi Termux kustom.',
      category,
      packages: packages
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      command:
        command.trim() ||
        `bash ${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sh`,
      scriptBody: scriptBody.trim(),
    });
    setTitle('');
    setDescription('');
    setCommand('');
    setShowCreate(false);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0B0E14]">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        {/* Intro header */}
        <div className="flex flex-col gap-3 border-b border-[#242E3F] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[#E7EDF6]">
              Termux Android Bridge
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#8C99B0]">
              Jalankan skrip shell dan Termux-API langsung di ponsel Android Anda untuk mengakses folder{' '}
              <code className="font-mono text-xs text-[#E7EDF6]">/sdcard</code>, mengecek status perangkat, atau sinkronisasi Git.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#F09A3E] px-4 text-xs font-semibold text-[#0B0E14] transition-colors hover:bg-[#F5AE5F] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Buat Skrip Baru</span>
          </button>
        </div>

        {/* One-time Termux setup reference */}
        <div className="mt-4 flex flex-col gap-2.5 rounded-xl border border-[#242E3F] bg-[#121721] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#E7EDF6]">
              Izin Penyimpanan Termux (Sekali Saja di Android)
            </p>
            <p className="mt-0.5 font-mono text-xs text-[#8C99B0]">
              termux-setup-storage && pkg update -y && pkg install -y termux-api
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              copyText(
                'setup-cmd',
                'termux-setup-storage && pkg update -y && pkg install -y termux-api',
                'Perintah setup Termux'
              )
            }
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap shrink-0"
          >
            {copiedKey === 'setup-cmd' ? (
              <Check className="h-3.5 w-3.5 text-[#22C55E]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[#F09A3E]" />
            )}
            <span>Salin Setup</span>
          </button>
        </div>

        {/* Optional create form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mt-4 space-y-3 rounded-xl border border-[#242E3F] bg-[#121721] p-4"
          >
            <h2 className="font-display text-sm font-semibold text-[#E7EDF6]">
              Simpan Skrip Termux Kustom
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tx-title" className="block text-xs font-medium text-[#C9D4E6]">
                  Judul Skrip
                </label>
                <input
                  id="tx-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Bersihkan Cache Unduhan"
                  className="mt-1 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 text-xs text-[#E7EDF6]"
                />
              </div>
              <div>
                <label htmlFor="tx-cat" className="block text-xs font-medium text-[#C9D4E6]">
                  Kategori
                </label>
                <select
                  id="tx-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TermuxCategory)}
                  className="mt-1 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 text-xs text-[#E7EDF6]"
                >
                  <option value="file">File & Storage</option>
                  <option value="device">Perangkat (Termux-API)</option>
                  <option value="dev">Developer</option>
                  <option value="network">Git & Jaringan</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tx-pkg" className="block text-xs font-medium text-[#C9D4E6]">
                  Paket Termux (pisah koma)
                </label>
                <input
                  id="tx-pkg"
                  type="text"
                  value={packages}
                  onChange={(e) => setPackages(e.target.value)}
                  placeholder="termux-api, jq, git"
                  className="mt-1 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 font-mono text-xs text-[#E7EDF6]"
                />
              </div>
              <div>
                <label htmlFor="tx-cmd" className="block text-xs font-medium text-[#C9D4E6]">
                  Perintah Jalankan (One-Liner)
                </label>
                <input
                  id="tx-cmd"
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="bash my-script.sh"
                  className="mt-1 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 font-mono text-xs text-[#E7EDF6]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="tx-desc" className="block text-xs font-medium text-[#C9D4E6]">
                Deskripsi Singkat
              </label>
              <input
                id="tx-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Apa yang dilakukan skrip ini di HP Android..."
                className="mt-1 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 text-xs text-[#E7EDF6]"
              />
            </div>
            <div>
              <label htmlFor="tx-body" className="block text-xs font-medium text-[#C9D4E6]">
                Isi Skrip Bash (.sh)
              </label>
              <textarea
                id="tx-body"
                rows={5}
                value={scriptBody}
                onChange={(e) => setScriptBody(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-[#242E3F] bg-[#0B0E14] p-3 font-mono text-xs leading-5 text-[#E7EDF6]"
              />
            </div>
            {formError && (
              <p role="alert" className="text-xs text-[#FCA5A5]">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="min-h-[40px] rounded-lg px-3.5 text-xs font-medium text-[#8C99B0] hover:text-[#E7EDF6]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-[#F09A3E] px-4 text-xs font-semibold text-[#0B0E14] hover:bg-[#F5AE5F]"
              >
                Simpan Skrip
              </button>
            </div>
          </form>
        )}

        {/* Filter bar */}
        <div
          role="tablist"
          aria-label="Filter kategori skrip Termux"
          className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {(Object.keys(CATEGORY_LABELS) as Array<'all' | TermuxCategory>).map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={filter === cat}
              onClick={() => setFilter(cat)}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === cat
                  ? 'bg-[#18202D] text-[#F09A3E] border border-[#F09A3E]/40'
                  : 'border border-transparent text-[#8C99B0] hover:bg-[#121721] hover:text-[#E7EDF6]'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Script list */}
        <div className="mt-4 space-y-4 pb-8">
          {visibleScripts.length === 0 ? (
            <div className="rounded-xl border border-[#242E3F] bg-[#121721] p-8 text-center">
              <Terminal className="mx-auto h-6 w-6 text-[#697791]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#E7EDF6]">
                Belum ada skrip pada kategori ini
              </p>
              <p className="mt-1 text-xs text-[#8C99B0]">
                Minta Koda di tab Terminal untuk membuatkan skrip Termux sesuai kebutuhan HP Anda.
              </p>
            </div>
          ) : (
            visibleScripts.map((script) => {
              const slug = script.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') || 'termux-script';

              return (
                <article
                  key={script.id}
                  className="rounded-xl border border-[#242E3F] bg-[#121721] p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold text-[#E7EDF6]">
                        {script.title}
                      </h3>
                      <p className="mt-1 font-mono text-[11px] text-[#8C99B0]">
                        {CATEGORY_LABELS[script.category]} ·{' '}
                        {script.origin === 'agent' ? 'Dibuat Koda' : 'Template bawaan'}
                        {script.packages.length > 0
                          ? ` · pkg: ${script.packages.join(', ')}`
                          : ''}
                      </p>
                    </div>

                    {script.origin === 'agent' && (
                      <button
                        type="button"
                        onClick={() => onDeleteScript(script.id)}
                        aria-label={`Hapus skrip ${script.title}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#697791] hover:bg-[#18202D] hover:text-[#FCA5A5]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-[#C9D4E6]">
                    {script.description}
                  </p>

                  {/* One-liner command */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 py-2">
                    <code className="truncate font-mono text-xs text-[#F09A3E]">
                      $ {script.command}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(`cmd-${script.id}`, script.command, `Perintah ${script.title}`)
                      }
                      aria-label={`Salin perintah ${script.title}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
                    >
                      {copiedKey === `cmd-${script.id}` ? (
                        <Check className="h-4 w-4 text-[#22C55E]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Full script body */}
                  <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-[#242E3F] bg-[#0B0E14] p-3 font-mono text-xs leading-5 text-[#D8E1F0]">
                    {script.scriptBody}
                  </pre>

                  {/* Actions */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyText(`body-${script.id}`, script.scriptBody, `Skrip ${script.title}`)
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap"
                    >
                      {copiedKey === `body-${script.id}` ? (
                        <Check className="h-3.5 w-3.5 text-[#22C55E]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-[#F09A3E]" />
                      )}
                      <span>Salin Skrip</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadTextFile(`${slug}.sh`, script.scriptBody, 'text/x-shellscript');
                        onNotify(`Mengunduh ${slug}.sh`);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5 text-[#F09A3E]" />
                      <span>Unduh .sh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskAgentModify(script)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6] whitespace-nowrap"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#F09A3E]" />
                      <span>Modifikasi lewat Agent</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
