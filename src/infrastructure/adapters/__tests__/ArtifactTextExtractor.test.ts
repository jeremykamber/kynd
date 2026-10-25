// @vitest-environment node
/**
 * Document extraction against real files: a generated PDF with a text layer, a
 * DOCX, a PPTX, and a PDF whose only content is a shape (the scan case). The
 * PDF proves the parser ran by finding its sentence; a "%PDF-1.4" string would
 * prove nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArtifactText, stripRtf, type ExtractableFile } from '../ArtifactTextExtractor';
import { MAX_TEXT_CHARS, ArtifactTextError } from '@/domain/entities/ArtifactIntakeLimits';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): ExtractableFile {
  const bytes = fs.readFileSync(path.join(FIXTURES, name));
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

function virtualFile(name: string, text: string): ExtractableFile {
  const bytes = Buffer.from(text, 'utf-8');
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

describe('extractArtifactText — real formats', () => {
  it('reads a PDF text layer', async () => {
    const result = await extractArtifactText([fixture('seed-brief.pdf')]);
    expect(result.text).toContain('41 paying teams');
    expect(result.text).toContain('Why now');
    expect(result.label).toBe('seed-brief.pdf');
  });

  it('reads a DOCX body', async () => {
    const result = await extractArtifactText([fixture('shared-analyses-brief.docx')]);
    expect(result.text).toContain('Feature Brief — Shared Analyses');
    expect(result.text).toContain('Links expire after 30 days');
  });

  it('reads PPTX slide text in slide order', async () => {
    const result = await extractArtifactText([fixture('pitch-deck.pptx')]);
    expect(result.text).toContain('Synthetic user research');
    expect(result.text.indexOf('The problem')).toBeLessThan(result.text.indexOf('Traction'));
    expect(result.text).toContain('$1.5M seed');
  });

  it.each([
    ['copy.txt', 'No scheduling. No incentives.'],
    ['landing-copy.md', 'Know what your users think before you ship.'],
    ['feature-list.csv', 'Document artifacts'],
    ['analysis-payload.json', 'The annual toggle resets'],
  ])('reads %s as plain text', async (name, expected) => {
    const result = await extractArtifactText([fixture(name)]);
    expect(result.text).toContain(expected);
  });

  it('strips RTF control words and keeps the sentences', async () => {
    const result = await extractArtifactText([fixture('product-notes.rtf')]);
    expect(result.text).toContain('Users skip the setup wizard');
    expect(result.text).toContain('Nobody read the pricing page');
    expect(result.text).not.toContain('\\par');
  });

  it('rejects a PDF with no text layer with the screenshot advice', async () => {
    await expect(extractArtifactText([fixture('scanned-page.pdf')])).rejects.toThrow(
      'No extractable text in "scanned-page.pdf" — upload the page as a screenshot instead.',
    );
  });
});

describe('extractArtifactText — selection rules', () => {
  it('concatenates in selection order with a named separator', async () => {
    const result = await extractArtifactText([fixture('copy.txt'), fixture('landing-copy.md')]);
    expect(result.text.indexOf('No scheduling.')).toBeLessThan(result.text.indexOf('Kynd — landing page'));
    expect(result.text).toContain('=== landing-copy.md ===');
    expect(result.label).toBe('copy.txt, landing-copy.md');
    expect(result.files.map((f) => f.name)).toEqual(['copy.txt', 'landing-copy.md']);
  });

  it('rejects more than five documents', async () => {
    const files = Array.from({ length: 6 }, (_, i) => virtualFile(`note-${i}.txt`, 'hello'));
    await expect(extractArtifactText(files)).rejects.toThrow('You can add up to 5 documents per run.');
  });

  it('rejects an unsupported extension with the accepted list', async () => {
    await expect(extractArtifactText([{ name: 'photo.png', size: 10, arrayBuffer: async () => new ArrayBuffer(0) }]))
      .rejects.toThrow('"photo.png" is not a supported format. Use PDF, DOCX, PPTX, TXT, MD, CSV, JSON, or RTF.');
  });

  it('rejects legacy Office formats with export instructions', async () => {
    await expect(extractArtifactText([{ name: 'old-brief.doc', size: 10, arrayBuffer: async () => new ArrayBuffer(0) }]))
      .rejects.toThrow('Export it to PDF or DOCX first.');
    await expect(extractArtifactText([{ name: 'old-deck.ppt', size: 10, arrayBuffer: async () => new ArrayBuffer(0) }]))
      .rejects.toThrow('Export it to PDF or DOCX first.');
  });

  it('rejects a document over 20 MB before reading it', async () => {
    let read = false;
    const file: ExtractableFile = {
      name: 'huge.pdf',
      size: 21 * 1024 * 1024,
      arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
    };
    await expect(extractArtifactText([file])).rejects.toThrow('Each document must be under 20 MB.');
    expect(read).toBe(false);
  });

  it('rejects a duplicate selection by name', async () => {
    await expect(extractArtifactText([fixture('copy.txt'), fixture('copy.txt')]))
      .rejects.toThrow('"copy.txt" is already in this run.');
  });

  it('rejects an empty selection', async () => {
    await expect(extractArtifactText([])).rejects.toThrow('Choose at least one document.');
  });

  it('rejects when the concatenated text passes the character cap', async () => {
    const half = 'x'.repeat(Math.ceil(MAX_TEXT_CHARS / 2));
    await expect(extractArtifactText([virtualFile('a.txt', half), virtualFile('b.txt', half)]))
      .rejects.toThrow(new RegExp(`${MAX_TEXT_CHARS.toLocaleString('en-US')} limit`));
  });

  it('reports user-correctable failures as ArtifactTextError', async () => {
    await expect(extractArtifactText([fixture('scanned-page.pdf')])).rejects.toBeInstanceOf(ArtifactTextError);
  });
});

describe('stripRtf', () => {
  it('drops destination groups and unescapes hex and unicode escapes', () => {
    const rtf = String.raw`{\rtf1{\fonttbl{\f0 Arial;}}\f0 Caf\'e9 na\"ive\par line {\b two}\par}`;
    const text = stripRtf(rtf);
    expect(text).not.toContain('fonttbl');
    expect(text).not.toContain('\\f0');
    expect(text).toContain('Café');
    expect(text).toContain('two');
  });
});
