import { AppProviders } from './providers/AppProviders.jsx';
import { AppRouter } from './routes/AppRouter.jsx';

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
