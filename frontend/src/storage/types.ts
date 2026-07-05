export type StoredFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface BlobStorage {
  put(file: File): Promise<StoredFile>;
  get(id: string): Promise<Blob>;
  list(): Promise<[StoredFile[]]>;
  delete(id: string): Promise<void>;
}
