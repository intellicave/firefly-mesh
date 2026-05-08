// Markdown-aware semantic chunking.
// Per plan M7-2 — preserves heading boundaries; ~512 tokens default,
// hard max 1024. Token estimation = chars/4 (conservative for English).
//
// Headings (# / ## / ###) reset the heading_path stack; chunk boundary
// is preferred at heading or paragraph break.

export interface Chunk {
  index: number;
  content: string;
  headingPath: string[];
  startOffset: number;
  endOffset: number;
}

export interface ChunkOpts {
  /** Soft target chunk size in tokens (~ chars/4). Default 512. */
  targetTokens?: number;
  /** Hard max in tokens. Default 1024. */
  maxTokens?: number;
  /** Estimate: chars per token. Default 4. */
  charsPerToken?: number;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const PARAGRAPH_BREAK = /\n\n+/;

export function chunkMarkdown(text: string, opts: ChunkOpts = {}): Chunk[] {
  const targetTokens = opts.targetTokens ?? 512;
  const maxTokens = opts.maxTokens ?? 1024;
  const cpt = opts.charsPerToken ?? 4;
  const targetChars = targetTokens * cpt;
  const maxChars = maxTokens * cpt;

  const lines = text.split("\n");
  const headingStack: string[] = [];
  const blocks: Array<{ text: string; headingPath: string[]; offset: number }> =
    [];
  let buffer: string[] = [];
  let bufferOffset = 0;
  let runningOffset = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const blockText = buffer.join("\n").trim();
    if (blockText.length > 0) {
      blocks.push({
        text: blockText,
        headingPath: [...headingStack],
        offset: bufferOffset,
      });
    }
    buffer = [];
    bufferOffset = runningOffset;
  };

  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      flushBuffer();
      const level = m[1]!.length;
      const title = m[2]!;
      headingStack.length = Math.max(0, level - 1);
      headingStack[level - 1] = title;
      bufferOffset = runningOffset;
    } else if (line.trim() === "") {
      buffer.push(line);
      if (PARAGRAPH_BREAK.test(buffer.join("\n"))) {
        flushBuffer();
      }
    } else {
      if (buffer.length === 0) bufferOffset = runningOffset;
      buffer.push(line);
    }
    runningOffset += line.length + 1; // +1 for the \n
  }
  flushBuffer();

  // Pack blocks into chunks of ~targetChars
  const chunks: Chunk[] = [];
  let currentText = "";
  let currentHeadingPath: string[] = [];
  let currentStart = 0;
  let currentEnd = 0;

  const pushChunk = () => {
    const trimmed = currentText.trim();
    if (trimmed.length === 0) return;
    chunks.push({
      index: chunks.length,
      content: trimmed,
      headingPath: [...currentHeadingPath],
      startOffset: currentStart,
      endOffset: currentEnd,
    });
    currentText = "";
  };

  for (const block of blocks) {
    const blockSize = block.text.length;
    if (currentText.length === 0) {
      currentHeadingPath = block.headingPath;
      currentStart = block.offset;
    }
    const headingChanged =
      currentText.length > 0 &&
      JSON.stringify(currentHeadingPath) !== JSON.stringify(block.headingPath);

    if (headingChanged || currentText.length + blockSize > targetChars) {
      pushChunk();
      currentHeadingPath = block.headingPath;
      currentStart = block.offset;
    }

    if (blockSize > maxChars) {
      // Block alone exceeds max — split on sentence/word boundary
      pushChunk();
      currentHeadingPath = block.headingPath;
      currentStart = block.offset;
      const splits = splitLong(block.text, maxChars);
      let cursor = block.offset;
      for (const piece of splits) {
        chunks.push({
          index: chunks.length,
          content: piece,
          headingPath: [...block.headingPath],
          startOffset: cursor,
          endOffset: cursor + piece.length,
        });
        cursor += piece.length;
      }
      currentEnd = cursor;
      continue;
    }

    if (currentText.length === 0) currentText = block.text;
    else currentText += "\n\n" + block.text;
    currentEnd = block.offset + blockSize;
  }
  pushChunk();

  return chunks;
}

function splitLong(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const remain = text.length - i;
    if (remain <= maxChars) {
      out.push(text.slice(i));
      break;
    }
    let end = i + maxChars;
    // Prefer sentence boundary
    const tail = text.slice(i, end);
    const lastSentence = tail.lastIndexOf(". ");
    const lastNewline = tail.lastIndexOf("\n");
    const lastSpace = tail.lastIndexOf(" ");
    if (lastSentence > maxChars * 0.5) end = i + lastSentence + 2;
    else if (lastNewline > maxChars * 0.5) end = i + lastNewline + 1;
    else if (lastSpace > maxChars * 0.5) end = i + lastSpace + 1;
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}
