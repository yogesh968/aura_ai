import type { DocumentInfo } from '@aura/shared';
import { Badge, type IconName } from '@/components/ui';

export function docIcon(mime: string): IconName {
  if (mime === 'application/pdf') return 'document-attach-outline';
  if (mime.startsWith('image/')) return 'image-outline';
  return 'document-text-outline';
}

export function StatusBadge({ status }: Pick<DocumentInfo, 'status'>) {
  switch (status) {
    case 'ready':
      return <Badge label="Summarized" tone="success" />;
    case 'processing':
      return <Badge label="Processing" tone="primary" />;
    case 'failed':
      return <Badge label="Summary failed" tone="danger" />;
    default:
      return <Badge label="Stored" />;
  }
}
