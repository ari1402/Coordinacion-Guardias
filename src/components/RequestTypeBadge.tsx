import type { RequestType } from '../types';
import { REQUEST_TYPE_LABEL } from '../types';
import Badge from './Badge';

const TONE: Record<RequestType, 'critical' | 'warning' | 'good'> = {
  bloqueo: 'critical',
  pedido_fuerte: 'warning',
  preferencia: 'good',
};

export default function RequestTypeBadge({ type }: { type: RequestType }) {
  return <Badge tone={TONE[type]}>{REQUEST_TYPE_LABEL[type]}</Badge>;
}
