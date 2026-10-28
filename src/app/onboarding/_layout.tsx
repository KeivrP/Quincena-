import { Stack } from 'expo-router/stack';
import { colors } from '../../theme';

// Pasos obligatorios: sin gesto de "atrás" para que no se puedan saltar.
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.bg } }}
    />
  );
}
