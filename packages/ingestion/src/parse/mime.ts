import { extname } from "node:path";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".html": "text/html",
};

/** Docling'e gonderilen dosyanin MIME turu; bilinmeyen uzanti icin genel tur. */
export function mimeForFile(filePath: string): string {
  return MIME_MAP[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
