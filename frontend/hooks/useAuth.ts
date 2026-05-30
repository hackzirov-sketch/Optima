// Re-export from context so all existing imports continue to work.
// Auth state is now a single shared instance via AuthProvider in providers.tsx.
export { useAuth } from '@/contexts/AuthContext';
