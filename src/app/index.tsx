import { Redirect } from 'expo-router';
import { nextOnboardingStep, useAuth } from '../auth/AuthProvider';

// Puerta de entrada: decide a dónde va el usuario según su sesión y su onboarding.
export default function Index() {
  const { status, profile, mustChangePassword } = useAuth();
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  const step = nextOnboardingStep(profile, mustChangePassword);
  return <Redirect href={step ?? '/home'} />;
}
