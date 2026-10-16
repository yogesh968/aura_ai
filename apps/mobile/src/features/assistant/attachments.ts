import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { MAX_DOCUMENT_BYTES, SUPPORTED_DOCUMENT_TYPES } from '@aura/shared';
import { endpoints } from '@/lib/api/endpoints';
import type { Attachment } from './useChatSession';

export class AttachmentError extends Error {}

type SupportedType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];
const isSupported = (t: string): t is SupportedType => (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(t);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function guessMime(name: string, given?: string | null): string {
  if (given && isSupported(given)) return given;
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, SupportedType> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return (ext && map[ext]) || given || 'application/octet-stream';
}

/** Let the user pick a photo; returns null if they cancel. Uploads it to their documents. */
export async function pickImageAttachment(): Promise<Attachment | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  if (!a.base64) throw new AttachmentError("Couldn't read that image.");
  const name = a.fileName ?? `photo-${Date.now()}.jpg`;
  const mimeType = guessMime(name, a.mimeType ?? 'image/jpeg');
  return upload(name, mimeType, a.base64, 'image');
}

/** Let the user pick a PDF/text/image file; returns null if they cancel. */
export async function pickDocumentAttachment(): Promise<Attachment | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: [...SUPPORTED_DOCUMENT_TYPES], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  if (a.size != null && a.size > MAX_DOCUMENT_BYTES) {
    throw new AttachmentError(`That file is ${mb(a.size)}. The limit is ${mb(MAX_DOCUMENT_BYTES)}.`);
  }
  const mimeType = guessMime(a.name, a.mimeType);
  const base64 = await new File(a.uri).base64();
  return upload(a.name, mimeType, base64, mimeType.startsWith('image/') ? 'image' : 'document');
}

async function upload(name: string, mimeType: string, base64: string, kind: Attachment['kind']): Promise<Attachment> {
  if (!isSupported(mimeType)) throw new AttachmentError('Supported files: PDF, text, Markdown, CSV and images.');
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_DOCUMENT_BYTES) throw new AttachmentError(`That file is ${mb(bytes)}. The limit is ${mb(MAX_DOCUMENT_BYTES)}.`);
  const doc = await endpoints.documents.upload({ name: name.slice(0, 200), mimeType, dataBase64: base64 });
  return { kind, documentId: doc.id, name: doc.name };
}
