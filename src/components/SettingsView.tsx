import React, { useState } from 'react';
import {
  Brain,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { AgentRolePreset, AgentSettings } from '../types/agent';

interface SettingsViewProps {
  settings: AgentSettings;
  sessionTrustedTools: string[];
  fileCount: number;
  messageCount: number;
  onUpdateSettings: (patch: Partial<AgentSettings>) => void;
  onResetTrustedTools: () => void;
  onClearChat: () => void;
  onResetWorkspace: () => void;
}

const ROLE_OPTIONS: Array<{ id: AgentRolePreset; label: string; desc: string }> = [
  {
    id: 'coder',
    label: 'Coding Agent (Default)',
    desc: 'Membaca struktur proyek, mencari bug, menulis & mengedit kode dengan diff presisi.',
  },
  {
    id: 'termux',
    label: 'Termux Android Architect',
    desc: 'Fokus otomasi ponsel Android, akses /sdcard, Termux-API, SSH, dan manajemen server lokal.',
  },
  {
    id: 'reviewer',
    label: 'Code Reviewer & Debugger',
    desc: 'Fokus audit keamanan, analisis root-cause error, dan perbaikan edge-case.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  sessionTrustedTools,
  fileCount,
  messageCount,
  onUpdateSettings,
  onResetTrustedTools,
  onClearChat,
  onResetWorkspace,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-[#0B0E14]">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5 sm:px-6 pb-10">
        <div className="border-b border-[#242E3F] pb-4">
          <h1 className="font-display text-xl font-bold tracking-tight text-[#E7EDF6]">
            Setelan Agent & Perizinan
          </h1>
          <p className="mt-1 text-sm text-[#8C99B0]">
            Atur bagaimana Koda meminta persetujuan sebelum mengubah file, kedalaman penalaran, dan karakter asisten.
          </p>
        </div>

        {/* Permission Policy */}
        <section className="space-y-4 rounded-xl border border-[#242E3F] bg-[#121721] p-4 sm:p-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#E7EDF6]">
              Mode Perizinan Aksi (Permission Gate)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#8C99B0]">
              Seperti Claude Code, Anda dapat menahan setiap aksi tulis/edit/eksekusi untuk ditinjau diff-nya terlebih dahulu, atau membiarkan agent berjalan otomatis.
            </p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ permissionMode: 'ask' })}
              className={`flex min-h-[76px] items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                settings.permissionMode === 'ask'
                  ? 'border-[#F09A3E] bg-[#18202D]'
                  : 'border-[#242E3F] bg-[#0B0E14] hover:border-[#36445C]'
              }`}
            >
              <ShieldAlert
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  settings.permissionMode === 'ask' ? 'text-[#F09A3E]' : 'text-[#697791]'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-[#E7EDF6]">Minta Izin Tiap Aksi</p>
                <p className="mt-0.5 text-xs text-[#8C99B0]">
                  Tampilkan pratinjau diff & konfirmasi sebelum edit, hapus, atau jalankan kode.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ permissionMode: 'auto' })}
              className={`flex min-h-[76px] items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                settings.permissionMode === 'auto'
                  ? 'border-[#22C55E] bg-[#18202D]'
                  : 'border-[#242E3F] bg-[#0B0E14] hover:border-[#36445C]'
              }`}
            >
              <ShieldCheck
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  settings.permissionMode === 'auto' ? 'text-[#22C55E]' : 'text-[#697791]'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-[#E7EDF6]">Otomatis Penuh</p>
                <p className="mt-0.5 text-xs text-[#8C99B0]">
                  Eksekusi seluruh langkah agent tanpa jeda; semua perubahan tetap bisa di-Undo.
                </p>
              </div>
            </button>
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 border-t border-[#242E3F] pt-3.5">
            <div>
              <p className="text-sm font-medium text-[#E7EDF6]">
                Minta izin juga saat membaca atau mencari file
              </p>
              <p className="text-xs text-[#8C99B0]">
                Berlaku pada mode Minta Izin (bawaan: baca file diizinkan otomatis).
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.askOnReadTools}
              onChange={(e) => onUpdateSettings({ askOnReadTools: e.target.checked })}
              className="h-5 w-5 rounded border-[#242E3F] accent-[#F09A3E]"
            />
          </label>

          {sessionTrustedTools.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-[#242E3F] pt-3">
              <p className="font-mono text-xs text-[#8C99B0]">
                Izin sesi aktif: {sessionTrustedTools.join(', ')}
              </p>
              <button
                type="button"
                onClick={onResetTrustedTools}
                className="min-h-[36px] rounded-lg border border-[#242E3F] px-3 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60"
              >
                Cabut Izin Sesi
              </button>
            </div>
          )}
        </section>

        {/* Reasoning & Role */}
        <section className="space-y-4 rounded-xl border border-[#242E3F] bg-[#121721] p-4 sm:p-5">
          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Brain className="mt-0.5 h-5 w-5 shrink-0 text-[#F09A3E]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#E7EDF6]">
                  Mode High Thinking (Penalaran Mendalam)
                </p>
                <p className="text-xs text-[#8C99B0]">
                  Mengaktifkan level penalaran tinggi (ThinkingLevel.HIGH) untuk debugging kompleks, arsitektur, dan analisis gambar mendalam.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.highThinking}
              onChange={(e) => onUpdateSettings({ highThinking: e.target.checked })}
              className="h-5 w-5 rounded border-[#242E3F] accent-[#F09A3E]"
            />
          </label>

          <div className="border-t border-[#242E3F] pt-4">
            <p className="text-sm font-semibold text-[#E7EDF6]">Peran & Instruksi Sistem Agent</p>
            <div className="mt-2.5 space-y-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => onUpdateSettings({ rolePreset: role.id })}
                  className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                    settings.rolePreset === role.id
                      ? 'border-[#F09A3E] bg-[#18202D]'
                      : 'border-[#242E3F] bg-[#0B0E14] hover:border-[#36445C]'
                  }`}
                >
                  <p className="text-xs font-semibold text-[#E7EDF6]">{role.label}</p>
                  <p className="mt-0.5 text-xs text-[#8C99B0]">{role.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Workspace Management */}
        <section className="space-y-4 rounded-xl border border-[#242E3F] bg-[#121721] p-4 sm:p-5">
          <div>
            <label
              htmlFor="workspace-name-input"
              className="block text-sm font-semibold text-[#E7EDF6]"
            >
              Nama Workspace
            </label>
            <input
              id="workspace-name-input"
              type="text"
              value={settings.workspaceName}
              onChange={(e) => onUpdateSettings({ workspaceName: e.target.value })}
              className="mt-1.5 w-full min-h-[42px] rounded-lg border border-[#242E3F] bg-[#0B0E14] px-3 font-mono text-xs text-[#E7EDF6]"
            />
            <p className="mt-1.5 font-mono text-[11px] text-[#8C99B0]">
              Penyimpanan lokal browser (IndexedDB) · {fileCount} file · {messageCount} pesan sesi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#242E3F] pt-4">
            <button
              type="button"
              onClick={onClearChat}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#242E3F] bg-[#18202D] px-3.5 text-xs font-medium text-[#E7EDF6] hover:border-[#F09A3E]/60"
            >
              <Trash2 className="h-3.5 w-3.5 text-[#8C99B0]" aria-hidden="true" />
              <span>Bersihkan Riwayat Terminal</span>
            </button>

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetWorkspace();
                    setConfirmReset(false);
                  }}
                  className="min-h-[42px] rounded-lg bg-[#EF4444] px-3.5 text-xs font-semibold text-white hover:bg-[#DC2626]"
                >
                  Ya, Reset ke Demo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[42px] rounded-lg px-3 text-xs text-[#8C99B0] hover:text-[#E7EDF6]"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3.5 text-xs font-medium text-[#FCA5A5] hover:bg-[#EF4444]/20"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset Workspace ke Proyek Demo</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
