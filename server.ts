import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'list_files',
    description: 'Melihat daftar seluruh file yang tersimpan di workspace proyek pengguna saat ini beserta ukuran dan asal file.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filterPrefix: {
          type: Type.STRING,
          description: 'Opsional: awalan folder atau nama file untuk memfilter daftar.',
        },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Membaca isi sebuah file di workspace berdasarkan path lengkapnya.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Path file di workspace, misalnya "src/calculator.ts".',
        },
        startLine: {
          type: Type.INTEGER,
          description: 'Opsional: nomor baris awal (1-indexed).',
        },
        endLine: {
          type: Type.INTEGER,
          description: 'Opsional: nomor baris akhir (1-indexed, inklusif).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Mencari teks atau pola regex di seluruh file workspace (seperti grep/ripgrep).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Kata kunci atau pola regex yang ingin dicari.',
        },
        isRegex: {
          type: Type.BOOLEAN,
          description: 'Set true jika query adalah ekspresi reguler.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description: 'Membuat file baru atau menimpa seluruh isi file di workspace. Gunakan untuk membuat file baru atau menulis ulang file kecil.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Path file tujuan, misalnya "src/utils/helper.ts".',
        },
        content: {
          type: Type.STRING,
          description: 'Isi lengkap file yang akan disimpan.',
        },
        summary: {
          type: Type.STRING,
          description: 'Ringkasan singkat perubahan dalam bahasa Indonesia.',
        },
      },
      required: ['path', 'content', 'summary'],
    },
  },
  {
    name: 'edit_file',
    description: 'Mengubah bagian tertentu pada file yang sudah ada dengan mencocokkan teks lama (oldText) secara persis dan menggantinya dengan newText.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Path file yang akan diedit.',
        },
        oldText: {
          type: Type.STRING,
          description: 'Potongan teks persis yang ada di file saat ini.',
        },
        newText: {
          type: Type.STRING,
          description: 'Potongan teks pengganti.',
        },
        summary: {
          type: Type.STRING,
          description: 'Ringkasan singkat alasan perubahan dalam bahasa Indonesia.',
        },
      },
      required: ['path', 'oldText', 'newText', 'summary'],
    },
  },
  {
    name: 'delete_file',
    description: 'Menghapus file yang tidak lagi diperlukan dari workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Path file yang akan dihapus.',
        },
        reason: {
          type: Type.STRING,
          description: 'Alasan penghapusan file.',
        },
      },
      required: ['path', 'reason'],
    },
  },
  {
    name: 'run_js_snippet',
    description: 'Menjalankan potongan kode JavaScript murni di sandbox lokal browser untuk menguji logika, perhitungan, atau validasi algoritma.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: {
          type: Type.STRING,
          description: 'Kode JavaScript yang mengembalikan hasil (return ...) atau memanggil console.log.',
        },
        description: {
          type: Type.STRING,
          description: 'Penjelasan singkat apa yang diuji.',
        },
      },
      required: ['code', 'description'],
    },
  },
  {
    name: 'save_termux_script',
    description: 'Menyimpan skrip bash/shell khusus Android Termux (termasuk Termux-API jika perlu) ke Termux Studio agar pengguna bisa langsung menyalin one-liner atau mengunduh file .sh di HP Android.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Judul singkat skrip Termux.',
        },
        description: {
          type: Type.STRING,
          description: 'Penjelasan fungsi skrip dan cara pakainya di Termux Android.',
        },
        category: {
          type: Type.STRING,
          description: 'Salah satu dari: file, device, dev, network.',
        },
        packages: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Daftar paket Termux yang dibutuhkan, misalnya ["termux-api", "jq", "git"].',
        },
        command: {
          type: Type.STRING,
          description: 'Perintah cepat satu baris untuk menjalankan skrip di Termux.',
        },
        scriptBody: {
          type: Type.STRING,
          description: 'Isi lengkap skrip bash diawali #!/data/data/com.termux/files/usr/bin/bash.',
        },
      },
      required: ['title', 'description', 'category', 'packages', 'command', 'scriptBody'],
    },
  },
];

function buildSystemInstruction(
  rolePreset: string,
  workspaceSummary: string,
  permissionMode: string
): string {
  const roleMap: Record<string, string> = {
    coder:
      'Kamu adalah Koda, AI Coding Agent otonom bergaya Claude Code / Codex yang dirancang untuk bekerja cepat dan presisi di perangkat mobile maupun desktop. Kamu membaca file sebelum mengedit, melakukan perubahan minimal dan akurat, dan menjelaskan hasil secara ringkas.',
    termux:
      'Kamu adalah Koda dalam mode Termux Android Architect. Selain mengelola kode workspace, kamu ahli membuat skrip bash aman untuk Termux Android, termux-setup-storage, termux-api (baterai, clipboard, notifikasi, sensor, penyimpanan /sdcard), git, ssh, dan otomasi perangkat Android.',
    reviewer:
      'Kamu adalah Koda dalam mode Code Reviewer & Debugger. Prioritaskan pencarian root-cause bug, edge case, potensi kerentanan keamanan, dan perbaikan terukur berdasarkan bukti isi file nyata.',
  };

  const persona = roleMap[rolePreset] || roleMap.coder;

  return `${persona}

Aturan kerja wajib:
1. Jawab dalam bahasa Indonesia yang jelas, ringkas, dan praktis (gunakan istilah teknis standar bila perlu).
2. Selalu gunakan tool nyata (list_files, read_file, search_files) untuk memeriksa isi workspace sebelum menyimpulkan atau mengubah kode. Jangan menebak isi file.
3. Saat diminta mengubah file, gunakan edit_file untuk perubahan terarah atau write_file untuk file baru.
4. Saat pengguna meminta otomasi HP Android, baca file penyimpanan /sdcard di Android, cek baterai/jaringan, atau perintah Termux, gunakan tool save_termux_script agar skrip langsung masuk ke tab Termux Studio dan bisa disalin/diunduh ke HP pengguna. Jelaskan jujur bahwa browser web menjalankan skrip Android lewat aplikasi Termux.
5. Jika pengguna melampirkan screenshot/gambar (misalnya error terminal, kode, atau tampilan UI), analisis detail gambarnya secara akurat lalu hubungkan dengan file di workspace bila relevan.
6. Mode perizinan pengguna saat ini: ${permissionMode === 'ask' ? 'Minta Izin (setiap aksi tulis/eksekusi akan dikonfirmasi pengguna)' : 'Otomatis'}. Jika pengguna menolak sebuah tool call, hormati keputusannya dan tawarkan alternatif tanpa memaksa.

Ringkasan file workspace saat ini:
${workspaceSummary || '(Workspace kosong — minta pengguna mengunggah file/folder atau buat file baru)'}`;
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === 'MISSING_API_KEY') {
    return {
      status: 503,
      message:
        'Kunci API Gemini belum terpasang. Silakan periksa konfigurasi kunci API di panel Settings > Secrets.',
    };
  }
  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(raw)) {
    return {
      status: 403,
      message:
        'Kunci API Gemini tidak valid atau tidak memiliki izin. Periksa kembali kunci API pada panel Settings > Secrets.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return {
      status: 429,
      message:
        'Kuota permintaan Gemini sementara tercapai (429). Tunggu beberapa saat atau gunakan kunci API dengan kuota lebih tinggi di Settings > Secrets.',
    };
  }
  if (/NOT_FOUND|404/i.test(raw)) {
    return {
      status: 404,
      message: `Model yang diminta tidak tersedia (${raw}).`,
    };
  }
  if (/UNAVAILABLE|503|high demand|timeout|abort/i.test(raw)) {
    return {
      status: 503,
      message:
        'Layanan Gemini sedang sibuk sementara (503). Tunggu beberapa detik lalu kirim ulang perintah Anda.',
    };
  }
  return {
    status: 500,
    message: `Gagal memproses permintaan agent: ${raw}`,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({ ok: true, configured: hasKey });
  });

  app.post('/api/agent/step', async (req, res) => {
    try {
      const {
        contents,
        workspaceSummary = '',
        rolePreset = 'coder',
        highThinking = false,
        permissionMode = 'ask',
      } = req.body ?? {};

      if (!Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({ error: 'Riwayat percakapan (contents) tidak boleh kosong.' });
        return;
      }

      const systemInstruction = buildSystemInstruction(
        String(rolePreset),
        String(workspaceSummary),
        String(permissionMode)
      );

      const primaryModel = 'gemini-4-hydrogen';
      const fallbackModel = 'gemini-3.1-flash-lite';
      let usedModel = primaryModel;
      let response;

      const aiPrimary = new GoogleGenAI({
        apiKey: (() => {
          const key = process.env.GEMINI_API_KEY?.trim();
          if (!key || key === 'MY_GEMINI_API_KEY') throw new Error('MISSING_API_KEY');
          return key;
        })(),
        httpOptions: {
          timeout: highThinking ? 45000 : 18000,
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const primaryConfig: Record<string, unknown> = {
        systemInstruction,
        tools: [{ functionDeclarations: AGENT_TOOLS }],
      };
      if (highThinking) {
        primaryConfig.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      }

      try {
        response = await aiPrimary.models.generateContent({
          model: primaryModel,
          contents,
          config: primaryConfig,
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransientOrTimeout = /abort|timeout|deadline|503|504|UNAVAILABLE|ETIMEDOUT|ECONNRESET/i.test(msg);
        if (!isTransientOrTimeout) {
          throw primaryErr;
        }
        // Brief backoff then fallback to gemini-3.1-flash-lite on transient spike/timeout
        await new Promise((r) => setTimeout(r, 800));
        usedModel = fallbackModel;
        const aiFallback = getGeminiClient();
        response = await aiFallback.models.generateContent({
          model: fallbackModel,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: AGENT_TOOLS }],
            ...(highThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
              : {}),
          },
        });
      }

      const candidateContent = response.candidates?.[0]?.content ?? null;
      const parts = candidateContent?.parts ?? [];

      const thoughtParts: string[] = [];
      const textParts: string[] = [];

      for (const part of parts) {
        const p = part as { text?: string; thought?: boolean };
        if (p.thought && p.text) {
          thoughtParts.push(p.text);
        } else if (p.text) {
          textParts.push(p.text);
        }
      }

      const functionCalls = (response.functionCalls ?? []).map((fc, index) => ({
        id: fc.id || `call_${Date.now()}_${index}`,
        name: fc.name || 'unknown_tool',
        args: (fc.args as Record<string, unknown>) || {},
      }));

      res.json({
        text: textParts.join('\n').trim() || (response.text ?? '').trim(),
        thoughtSummary: thoughtParts.join('\n').trim(),
        functionCalls,
        rawModelContent: candidateContent,
        modelUsed: usedModel,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/agent/quick', async (req, res) => {
    try {
      const { task, input } = req.body ?? {};
      if (!input || typeof input !== 'string') {
        res.status(400).json({ error: 'Input teks wajib diisi.' });
        return;
      }

      const ai = getGeminiClient();
      const model = 'gemini-3.1-flash-lite';
      const prompt =
        task === 'title'
          ? `Buat judul sesi super singkat (maksimal 5 kata bahasa Indonesia, tanpa tanda kutip) untuk perintah coding berikut:\n${input.slice(0, 400)}`
          : `Ringkas perubahan atau kode berikut dalam 1 kalimat padat berbahasa Indonesia:\n${input.slice(0, 1200)}`;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      res.json({
        result: (response.text ?? '').trim(),
        modelUsed: model,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Koda server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
