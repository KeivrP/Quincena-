import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { messageFor } from '../api/errors';
import { authApi } from '../api/endpoints';
import { Banner, Button, Card, Field, OrangeHeader, Screen, T } from '../components/ui';
import { isValidEmail, passwordIssues } from '../lib/validators';
import { colors, space } from '../theme';

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!isValidEmail(email)) return setError('Escribe un correo válido.');
    setLoading(true);
    setError(null);
    try {
      await authApi.requestPasswordReset(email.trim().toLowerCase());
      setStep('code');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) return setError('El código tiene 6 dígitos.');
    const issues = passwordIssues(pw);
    if (issues.length) return setError(`Tu contraseña necesita: ${issues.join(', ').toLowerCase()}.`);
    if (pw !== pw2) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    setError(null);
    try {
      await authApi.confirmPasswordReset(email.trim().toLowerCase(), code, pw);
      setStep('done');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Recuperar contraseña" subtitle="Te enviaremos un código de 6 dígitos" />
      <Screen edges={[]}>
        <Card>
          {error ? (
            <View style={{ marginBottom: space.md }}>
              <Banner tone="error" message={error} />
            </View>
          ) : null}
          {step === 'email' ? (
            <>
              <Field
                label="Correo"
                icon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Button title="Enviar código" onPress={send} loading={loading} />
            </>
          ) : step === 'code' ? (
            <>
              <T color={colors.textMuted} style={{ marginBottom: space.md }}>
                Si {email} está registrado, te llegó un código. Escríbelo junto con tu nueva contraseña.
              </T>
              <Field
                label="Código"
                icon="keypad-outline"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <Field
                label="Nueva contraseña"
                icon="lock-closed-outline"
                secure
                value={pw}
                onChangeText={setPw}
                hint="Mín. 8 caracteres, mayúscula, minúscula y número"
              />
              <Field label="Repite la contraseña" icon="lock-closed-outline" secure value={pw2} onChangeText={setPw2} />
              <Button title="Cambiar contraseña" onPress={confirm} loading={loading} />
              <Button title="Reenviar código" variant="ghost" onPress={send} />
            </>
          ) : (
            <>
              <Banner
                tone="success"
                title="¡Listo!"
                message="Tu contraseña fue actualizada. Ya puedes iniciar sesión."
              />
              <Button
                title="Ir a iniciar sesión"
                style={{ marginTop: space.md }}
                onPress={() => router.replace('/login')}
              />
            </>
          )}
        </Card>
      </Screen>
    </View>
  );
}
