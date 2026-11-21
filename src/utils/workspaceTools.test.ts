import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildToolDiffPreview,
  buildWorkspaceSummary,
  computeUnifiedDiff,
  detectLanguage,
  executeWorkspaceTool,
  normalizePath,
  requiresPermission,
  runJsSnippetSafe,
} from './workspaceTools';
import { SEED_TERMUX_SCRIPTS, SEED_WORKSPACE_FILES } from '../data/seedWorkspace';

test('normalizePath cleans leading slashes and blocks traversal', () => {
  assert.equal(normalizePath('./src/app.ts'), 'src/app.ts');
  assert.equal(normalizePath('/scripts//backup.sh'), 'scripts/backup.sh');
  assert.throws(() => normalizePath('../secret.txt'));
  assert.throws(() => normalizePath('   '));
});

test('detectLanguage maps common extensions cleanly', () => {
  assert.equal(detectLanguage('src/index.ts'), 'typescript');
  assert.equal(detectLanguage('scripts/run.sh'), 'bash');
  assert.equal(detectLanguage('notes.unknown'), 'text');
});

test('computeUnifiedDiff computes accurate additions and removals', () => {
  const diff = computeUnifiedDiff('line 1\nline 2\nline 3', 'line 1\nline 2 fixed\nline 3\nline 4', 'src/a.ts');
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 1);
  assert.match(diff.diffText, /-line 2/);
  assert.match(diff.diffText, /\+line 2 fixed/);
  assert.match(diff.diffText, /\+line 4/);
});

test('requiresPermission enforces ask vs auto and trusted tools', () => {
  assert.equal(requiresPermission('write_file', 'ask', false, []), true);
  assert.equal(requiresPermission('read_file', 'ask', false, []), false);
  assert.equal(requiresPermission('read_file', 'ask', true, []), true);
  assert.equal(requiresPermission('write_file', 'auto', true, []), false);
  assert.equal(requiresPermission('write_file', 'ask', false, ['write_file']), false);
  assert.equal(requiresPermission('delete_file', 'ask', false, ['*']), false);
});

test('executeWorkspaceTool reads, searches, edits, creates, and deletes files cleanly', () => {
  // List
  const listed = executeWorkspaceTool('list_files', {}, SEED_WORKSPACE_FILES, SEED_TERMUX_SCRIPTS);
  assert.equal(listed.result.count, Object.keys(SEED_WORKSPACE_FILES).length);

  // Search
  const found = executeWorkspaceTool('search_files', { query: 'afterDiscount' }, SEED_WORKSPACE_FILES, SEED_TERMUX_SCRIPTS);
  assert.ok(Number(found.result.matchCount) >= 2);

  // Edit exact match
  const edited = executeWorkspaceTool(
    'edit_file',
    {
      path: 'src/calculator.ts',
      oldText: 'const afterDiscount = subtotal + discountAmount;',
      newText: 'const afterDiscount = subtotal - discountAmount;',
      summary: 'Perbaiki kalkulasi diskon',
    },
    SEED_WORKSPACE_FILES,
    SEED_TERMUX_SCRIPTS,
    'tc_1'
  );
  assert.equal(edited.isError, undefined);
  assert.equal(edited.changedPath, 'src/calculator.ts');
  assert.ok(edited.snapshot);
  assert.match(edited.updatedFiles['src/calculator.ts'].content, /subtotal - discountAmount/);

  // Write new file
  const created = executeWorkspaceTool(
    'write_file',
    {
      path: 'src/helper.ts',
      content: 'export const double = (n: number) => n * 2;\n',
      summary: 'Tambah helper',
    },
    edited.updatedFiles,
    SEED_TERMUX_SCRIPTS
  );
  assert.ok(created.updatedFiles['src/helper.ts']);
  assert.equal(created.result.action, 'created');

  // Delete file
  const deleted = executeWorkspaceTool(
    'delete_file',
    { path: 'src/helper.ts', reason: 'Bersihkan file uji' },
    created.updatedFiles,
    SEED_TERMUX_SCRIPTS
  );
  assert.equal(deleted.updatedFiles['src/helper.ts'], undefined);
  assert.equal(deleted.snapshot?.afterContent, null);
});

test('executeWorkspaceTool saves Termux script into library', () => {
  const res = executeWorkspaceTool(
    'save_termux_script',
    {
      title: 'Cek Ruang Penyimpanan',
      description: 'Menampilkan sisa kapasitas /sdcard',
      category: 'file',
      packages: ['coreutils'],
      command: 'df -h /sdcard',
      scriptBody: '#!/data/data/com.termux/files/usr/bin/bash\ndf -h /sdcard',
    },
    SEED_WORKSPACE_FILES,
    SEED_TERMUX_SCRIPTS
  );
  assert.equal(res.updatedScripts.length, SEED_TERMUX_SCRIPTS.length + 1);
  assert.equal(res.updatedScripts[0].origin, 'agent');
  assert.equal(res.updatedScripts[0].title, 'Cek Ruang Penyimpanan');
});

test('runJsSnippetSafe executes valid JS and catches runtime errors safely', () => {
  const okRun = runJsSnippetSafe('console.log("hitung"); return 21 * 2;');
  assert.equal(okRun.ok, true);
  assert.deepEqual(okRun.logs, ['hitung']);
  assert.equal(okRun.returnValue, '42');

  const badRun = runJsSnippetSafe('throw new Error("boom")');
  assert.equal(badRun.ok, false);
  assert.match(badRun.error ?? '', /boom/);
});

test('buildToolDiffPreview and buildWorkspaceSummary return readable output', () => {
  const preview = buildToolDiffPreview(
    'edit_file',
    {
      path: 'src/calculator.ts',
      oldText: 'subtotal + discountAmount',
      newText: 'subtotal - discountAmount',
    },
    SEED_WORKSPACE_FILES
  );
  assert.ok(preview);
  assert.match(preview, /\+.*subtotal - discountAmount/);

  const summary = buildWorkspaceSummary(SEED_WORKSPACE_FILES);
  assert.match(summary, /src\/calculator\.ts/);
});
