import { type FeatureManifest } from '@/shared/navigation/navigation';

import { PendingCount } from './pending-count';

export const captureManifest: FeatureManifest = {
  id: 'capture',
  title: 'Bandeja',
  route: '/capture',
  icon: 'square',
  flag: 'FEATURE_CAPTURE',
  // Siempre a la vista, también en el teléfono, con cuántas hay por revisar (decisión 17).
  pinned: true,
  counter: <PendingCount />,
};
