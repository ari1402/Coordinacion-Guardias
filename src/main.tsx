import { createRoot } from 'react-dom/client';
import './index.css';

// bootstrap.tsx queda en un chunk aparte (lazy) para no meter Firebase +
// Recharts en el bundle inicial.
const root = createRoot(document.getElementById('root')!);
import('./bootstrap').then(({ default: Bootstrap }) => {
  root.render(<Bootstrap />);
});
