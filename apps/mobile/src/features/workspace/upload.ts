import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { MAX_DOCUMENT_BYTES, SUPPORTED_DOCUMENT_TYPES } from '@aura/shared';
import { formatBytes } from './helpers';

export interface PickedFile {
  name: string;
  mimeType: (typeof SUPPORTED_DOCUMENT_TYPES)[number];
  dataBase64: string;
  previewUri?: string;
}

export class PickError extends Error {}

const EXT_TYPES: Record<string, (typeof SUPPORTED_DOCUMENT_TYPES)[number]> = {
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

function resolveType(name: string, mime?: string | null) {
  if (mime && (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(mime)) return mime as PickedFile['mimeType'];
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? null;
}

const tooBig = () => new PickError(`Files must be under ${formatBytes(MAX_DOCUMENT_BYTES)}.`);

/** Pick a PDF, text or image file. Returns null if the user cancelled. */
export async function pickDocumentFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: [...SUPPORTED_DOCUMENT_TYPES], copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return null;
  const asset = res.assets[0];
  if (!asset) return null;
  const mimeType = resolveType(asset.name, asset.mimeType);
  if (!mimeType) throw new PickError('That file type is not supported. Use PDF, text, Markdown, CSV or an image.');
  if (asset.size != null && asset.size > MAX_DOCUMENT_BYTES) throw tooBig();
  const dataBase64 = await new File(asset.uri).base64();
  if (dataBase64.length * 0.75 > MAX_DOCUMENT_BYTES) throw tooBig();
  return { name: asset.name, mimeType, dataBase64 };
}

/** Take a photo or pick one from the gallery. Returns null on cancel; throws PickError on denied permission. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedFile | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PickError('Camera permission is off. Allow it in system settings to scan documents.');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PickError('Photo access is off. Allow it in system settings to pick an image.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, base64: true };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled) return null;
  const a = res.assets[0];
  if (!a) return null;
  const dataBase64 = a.base64 ?? (await new File(a.uri).base64());
  if (dataBase64.length * 0.75 > MAX_DOCUMENT_BYTES) throw tooBig();
  const mimeType = resolveType(a.fileName ?? 'photo.jpg', a.mimeType) ?? 'image/jpeg';
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const name = a.fileName ?? `${source === 'camera' ? 'Scan' : 'Image'} ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.${ext}`;
  return { name, mimeType, dataBase64, previewUri: a.uri };
}
