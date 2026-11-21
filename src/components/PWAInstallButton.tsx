import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#F09A3E] px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] transition-colors hover:bg-[#F5AE5F] whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Pasang App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#242E3F] bg-[#18202D] px-3 py-1.5 text-xs font-medium text-[#E7EDF6] transition-colors hover:border-[#F09A3E]/60 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-[#F09A3E]" aria-hidden="true" />
          <span>Pasang di iPhone</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-xl border border-[#242E3F] bg-[#121721] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="ios-install-title"
                  className="font-display text-base font-semibold text-[#E7EDF6]"
                >
                  Pasang Koda ke Layar Utama
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Tutup panduan pasang iOS"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8C99B0] hover:bg-[#18202D] hover:text-[#E7EDF6]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-[#C9D4E6]">
                <li>1. Ketuk tombol Bagikan (Share) pada bilah bawah Safari.</li>
                <li>2. Gulir ke bawah lalu pilih Tambah ke Layar Utama.</li>
                <li>3. Ketuk Tambah agar Koda terbuka layar penuh seperti aplikasi native.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg bg-[#F09A3E] text-sm font-semibold text-[#0B0E14] transition-colors hover:bg-[#F5AE5F]"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
