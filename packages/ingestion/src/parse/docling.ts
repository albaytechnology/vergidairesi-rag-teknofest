import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { config } from "@albay/shared";
import { mimeForFile } from "./mime.ts";
import type { DoclingResponse, DoclingResult } from "./types.ts";

/** docling-serve container'ina (docker compose -> :5001) dosya gonderip Markdown + JSON alir. */
export class DoclingClient {
  private baseUrl: string;

  constructor(baseUrl: string = config.DOCLING_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async convertFile(filePath: string): Promise<DoclingResult> {
    const buf = await readFile(filePath);

    const form = new FormData();
    form.append(
      "files",
      new Blob([buf], { type: mimeForFile(filePath) }),
      basename(filePath),
    );
    form.append("to_formats", "md");
    form.append("to_formats", "json");
    form.append("image_export_mode", "placeholder");

    const res = await fetch(`${this.baseUrl}/v1/convert/file`, {
      method: "POST",
      headers: { accept: "application/json" },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Docling hatasi: HTTP ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as DoclingResponse;
    if (data.status === "failure" || data.status === "skipped") {
      throw new Error(
        `Docling donusturemedi (${data.status}): ${JSON.stringify(data.errors).slice(0, 300)}`,
      );
    }
    if (!data.document.md_content) {
      throw new Error("Docling bos markdown dondurdu");
    }
    return {
      markdown: data.document.md_content,
      doclingJson: data.document.json_content,
      processingTimeSec: data.processing_time,
    };
  }
}
