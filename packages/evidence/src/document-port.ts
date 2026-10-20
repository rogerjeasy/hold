export type DocumentStore = {
  put(key: string, bytes: Buffer, contentType: 'application/pdf' | 'application/json'): Promise<{ readonly versionId: string; readonly sha256: string }>
  read(key: string, versionId: string): Promise<Buffer>
  downloadLink(key: string, versionId: string, filename: string): Promise<string>
}
