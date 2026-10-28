import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, messageFor } from '../api/errors';
import { USE_MOCK } from '../api/config';
import { useAuth } from '../auth/AuthProvider';
import { Banner, Button, Field, Logo, T } from '../components/ui';
import { isValidEmail } from '../lib/validators';
import { colors, radius, shadow, space } from '../theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(USE_MOCK ? 'maria.perez@demo.com' : '');
  const [password, setPassword] = useState(USE_MOCK ? 'Temporal123' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; reason?: string } | null>(null);

  const submit = async () => {
    if (!isValidEmail(email)) return setError({ msg: 'Escribe un correo válido.' });
    if (!password) return setError({ msg: 'Escribe tu contraseña.' });
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (e) {
      setError({ msg: messageFor(e), reason: e instanceof ApiError ? e.reason : undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.orange} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginTop: space.lg, marginBottom: space.lg }}>
              <Logo size={64} light />
              <T variant="h1" color={colors.white} style={{ marginTop: space.md }}>
                Bienvenido
              </T>
              <T color={colors.onPrimaryMuted}>Ingresa para ver tu cupo disponible</T>
            </View>

            <View style={styles.card}>
              <T variant="h2" style={{ marginBottom: space.md }}>
                Iniciar sesión
              </T>
              {error ? (
                <View style={{ marginBottom: space.md }}>
                  <Banner tone="error" message={error.msg} />
                </View>
              ) : null}
              <Field
                label="Correo"
                icon="mail-outline"
                placeholder="tucorreo@empresa.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Field
                label="Contraseña"
                icon="lock-closed-outline"
                placeholder="••••••••"
                secure
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
              />
              <T
                variant="label"
                color={colors.primary}
                style={{ alignSelf: 'flex-end', marginBottom: space.lg }}
                onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
              >
                ¿Olvidaste tu contraseña?
              </T>
              <Button title="Entrar" onPress={submit} loading={loading} />
              {error?.reason === 'temporary_password_expired' ? (
                <Button
                  title="Crear contraseña nueva"
                  variant="outline"
                  style={{ marginTop: space.sm }}
                  onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
                />
              ) : null}
            </View>

            <T
              variant="label"
              color={colors.textMuted}
              style={{ textAlign: 'center', marginTop: space.lg }}
              onPress={() => router.push('/check-email')}
            >
              ¿Primera vez?{' '}
              <T variant="label" color={colors.primary}>
                Revisa tu correo de bienvenida
              </T>
            </T>
            {USE_MOCK ? (
              <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.md }}>
                Modo demo: datos simulados, sin conexión al servidor.
              </T>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  orange: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, ...shadow },
});
