// Document parsers for KB upload pipeline.
// Per design §6.7b — supports pdf / docx / md / txt / html.
//
// All parsers normalize to a single utf-8 string. The chunker downstream
// uses heading hints embedded in the text (markdown headings preserved
// for md/html sources; pdf/docx flatten to paragraphs).

import { convert as htmlToText } from "html-to-text";
// mammoth has no published .d.ts → declare minimal surface we use.
import * as mammothNS from "mammoth";
const mammoth = mammothNS as unknown as {
  convertToMarkdown: (input: {
    buffer: Buffer;
  }) => Promise<{ value: string }>;
  extractRawText: (input: {
    buffer: Buffer;
  }) => Promise<{ value: string }>;
};
import pdfParse from "pdf-parse";

export type FileType = "pdf" | "docx" | "md" | "txt" | "html";

export interface ParsedDocument {
  text: string;
  meta: {
    bytes: number;
    estPages?: number;
  };
}

export async function parseFile(
  buffer: Buffer,
  fileType: FileType,
): Promise<ParsedDocument> {
  switch (fileType) {
    case "pdf": {
      const result = await pdfParse(buffer);
      return {
        text: normalizeWhitespace(result.text),
        meta: { bytes: buffer.byteLength, estPages: result.numpages },
      };
    }
    case "docx": {
      const result = await mammoth.convertToMarkdown({ buffer });
      return {
        text: normalizeWhitespace(result.value),
        meta: { bytes: buffer.byteLength },
      };
    }
    case "md":
    case "txt": {
      return {
        text: normalizeWhitespace(buffer.toString("utf-8")),
        meta: { bytes: buffer.byteLength },
      };
    }
    case "html": {
      const text = htmlToText(buffer.toString("utf-8"), {
        wordwrap: false,
        selectors: [
          { selector: "h1", options: { uppercase: false } },
          { selector: "h2", options: { uppercase: false } },
          { selector: "h3", options: { uppercase: false } },
          { selector: "img", format: "skip" },
        ],
      });
      return {
        text: normalizeWhitespace(text),
        meta: { bytes: buffer.byteLength },
      };
    }
  }
}

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
