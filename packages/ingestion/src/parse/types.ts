export interface DoclingResult {
  markdown: string;
  /** Docling'in yapisal JSON ciktisi — sayfa/pozisyon bilgisi burada (Faz 2'de chunking icin). */
  doclingJson: unknown;
  processingTimeSec: number;
}

/** docling-serve /v1/convert/file yanit govdesi. */
export interface DoclingResponse {
  document: {
    md_content: string | null;
    json_content: unknown;
  };
  status: "success" | "partial_success" | "skipped" | "failure";
  processing_time: number;
  errors: unknown[];
}
