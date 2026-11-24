import { RouterProvider } from '@tanstack/solid-router';
import { router } from './router';

export default function App() {
  return <RouterProvider router={router} />;
}
