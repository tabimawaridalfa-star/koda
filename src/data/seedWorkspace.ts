import type { TermuxScript, WorkspaceFile } from '../types/agent';

const NOW = 1763720000000;

export const SEED_WORKSPACE_FILES: Record<string, WorkspaceFile> = {
  'README.md': {
    path: 'README.md',
    language: 'markdown',
    origin: 'sample',
    updatedAt: NOW,
    content: `# Proyek Demo Koda

Workspace ini siap dipakai untuk mencoba Koda sebagai AI coding & Termux agent langsung dari HP.

## Coba perintah berikut di Terminal:
- "Periksa bug di src/calculator.ts lalu perbaiki"
- "Cari semua fungsi yang memakai discount di workspace ini"
- "Buatkan skrip Termux untuk cek baterai dan kirim notifikasi Android"
- Atau unggah file/folder proyek Anda sendiri lewat tab File.
`,
    size: 412,
  },
  'src/calculator.ts': {
    path: 'src/calculator.ts',
    language: 'typescript',
    origin: 'sample',
    updatedAt: NOW,
    content: `export interface CartItem {
  name: string;
  price: number;
  qty: number;
}

/**
 * Menghitung subtotal, diskon, pajak PPN 11%, dan total akhir.
 * Catatan: sengaja terdapat bug diskon (diskon ditambahkan alih-alih dikurangi)
 * agar mudah diuji dengan perintah debugging ke agent.
 */
export function calculateInvoice(items: CartItem[], discountPercent = 0) {
  const subtotal = items.reduce((acc, item) => acc + item.price * item.qty, 0);
  const clampedDiscount = Math.max(0, Math.min(100, discountPercent));
  const discountAmount = Math.round((subtotal * clampedDiscount) / 100);
  // Bug: seharusnya subtotal - discountAmount
  const afterDiscount = subtotal + discountAmount;
  const tax = Math.round(afterDiscount * 0.11);
  const total = afterDiscount + tax;

  return {
    subtotal,
    discountAmount,
    tax,
    total,
  };
}
`,
    size: 830,
  },
  'src/app.ts': {
    path: 'src/app.ts',
    language: 'typescript',
    origin: 'sample',
    updatedAt: NOW,
    content: `import { calculateInvoice } from './calculator';

const sampleOrder = [
  { name: 'Kabel USB-C 2m', price: 65000, qty: 2 },
  { name: 'Adapter 45W', price: 185000, qty: 1 },
];

export function runDemoInvoice() {
  const result = calculateInvoice(sampleOrder, 10);
  return {
    items: sampleOrder.length,
    ...result,
  };
}
`,
    size: 348,
  },
  'scripts/termux-backup.sh': {
    path: 'scripts/termux-backup.sh',
    language: 'bash',
    origin: 'sample',
    updatedAt: NOW,
    content: `#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# Backup folder proyek Termux ke penyimpanan internal Android
SOURCE_DIR="$HOME/projects"
BACKUP_DIR="$HOME/storage/shared/Download/koda-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/projects-$STAMP.tar.gz" -C "$SOURCE_DIR" .
echo "Backup selesai: $BACKUP_DIR/projects-$STAMP.tar.gz"
`,
    size: 403,
  },
};

export const SEED_TERMUX_SCRIPTS: TermuxScript[] = [
  {
    id: 'tpl-storage-backup',
    title: 'Backup Folder Proyek ke /sdcard',
    description:
      'Mengarsipkan folder proyek di Termux ke folder Download Android agar aman dan mudah diakses file manager.',
    category: 'file',
    packages: ['tar', 'gzip'],
    command: 'termux-setup-storage && bash termux-backup.sh',
    scriptBody: `#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SOURCE_DIR="\${1:-$HOME/projects}"
BACKUP_DIR="$HOME/storage/shared/Download/koda-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Folder tidak ditemukan: $SOURCE_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
ARCHIVE="$BACKUP_DIR/backup-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$SOURCE_DIR" .
echo "Backup berhasil disimpan di: $ARCHIVE"`,
    createdAt: NOW,
    origin: 'template',
  },
  {
    id: 'tpl-device-health',
    title: 'Cek Baterai, Suhu & Wi-Fi via Termux-API',
    description:
      'Membaca status baterai, suhu perangkat, dan koneksi Wi-Fi Android lalu menampilkan notifikasi ringkas.',
    category: 'device',
    packages: ['termux-api', 'jq'],
    command: 'pkg install -y termux-api jq && bash device-health.sh',
    scriptBody: `#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

BAT_JSON="$(termux-battery-status)"
PERCENT="$(echo "$BAT_JSON" | jq -r '.percentage')"
TEMP="$(echo "$BAT_JSON" | jq -r '.temperature')"
STATUS="$(echo "$BAT_JSON" | jq -r '.status')"
WIFI="$(termux-wifi-connectioninfo | jq -r '.ssid // "Tidak tersambung"')"

SUMMARY="Baterai: \${PERCENT}% (\${STATUS}) | Suhu: \${TEMP}C | Wi-Fi: \${WIFI}"
echo "$SUMMARY"
termux-notification --title "Koda Device Check" --content "$SUMMARY"`,
    createdAt: NOW - 1000,
    origin: 'template',
  },
  {
    id: 'tpl-local-dev',
    title: 'Jalankan Server Web Lokal di HP',
    description:
      'Menyalakan server Node.js/Vite pada jaringan lokal HP lengkap dengan deteksi alamat IP Wi-Fi.',
    category: 'dev',
    packages: ['nodejs-lts', 'git'],
    command: 'pkg install -y nodejs-lts && bash serve-local.sh',
    scriptBody: `#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_DIR="\${1:-$PWD}"
PORT="\${2:-3000}"

cd "$PROJECT_DIR"
echo "Menjalankan dev server di http://localhost:$PORT"
npx --yes serve -l "$PORT" .`,
    createdAt: NOW - 2000,
    origin: 'template',
  },
  {
    id: 'tpl-git-sync',
    title: 'Quick Git Status, Commit & Push',
    description:
      'Menampilkan perubahan file di repo Git Android lalu langsung commit dan push dengan pesan otomatis.',
    category: 'network',
    packages: ['git', 'openssh'],
    command: 'bash git-quick-sync.sh "update dari hp"',
    scriptBody: `#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

MSG="\${1:-chore: sync dari Termux $(date +%Y-%m-%d_%H:%M)}"
git status -s
git add -A
if git diff --cached --quiet; then
  echo "Tidak ada perubahan untuk di-commit."
  exit 0
fi
git commit -m "$MSG"
git push
echo "Sinkronisasi Git selesai."`,
    createdAt: NOW - 3000,
    origin: 'template',
  },
];
