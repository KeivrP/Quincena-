import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { messageFor } from '../../api/errors';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Steps } from '../../components/Steps';
import { Banner, Button, Card, Field, OrangeHeader, Screen, T } from '../../components/ui';
import { passwordIssues } from '../../lib/validators';
import { colors, space } from '../../theme';

export default function ChangePassword() {
  const { passwordChanged, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = passwordIssues(pw);

  const submit = async () => {
    if (!current) return setError('Escribe la contraseña temporal que te llegó por correo.');
    if (issues.length) return setError(`Tu contraseña necesita: ${issues.join(', ').toLowerCase()}.`);
    if (pw !== pw2) return setError('Las contraseñas no coinciden.');
    if (pw === current) return setError('La nueva contraseña debe ser distinta a la temporal.');
    setLoading(true);
    setError(null);
    try {
      await authApi.changePassword(current, pw);
      await passwordChanged();
      router.replace('/');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Crea tu contraseña" back={false} subtitle="Por seguridad, cambia la contraseña temporal">
        <Steps current={0} />
      </OrangeHeader>
      <Screen edges={[]}>
        <Card>
          {error ? (
            <View style={{ marginBottom: space.md }}>
              <Banner tone="error" message={error} />
            </View>
          ) : null}
          <Field label="Contraseña temporal" icon="key-outline" secure value={current} onChangeText={setCurrent} />
          <Field label="Nueva contraseña" icon="lock-closed-outline" secure value={pw} onChangeText={setPw} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: space.md }}>
            {['Al menos 8 caracteres', 'Una mayúscula', 'Una minúscula', 'Un número'].map((rule) => {
              const ok = pw.length > 0 && !issues.includes(rule);
              return (
                <T key={rule} variant="caption" color={ok ? colors.success : colors.textMuted}>
                  {ok ? '✓' : '•'} {rule}
                </T>
              );
            })}
          </View>
          <Field label="Repite la contraseña" icon="lock-closed-outline" secure value={pw2} onChangeText={setPw2} />
          <Button title="Guardar y continuar" onPress={submit} loading={loading} />
        </Card>
        <Button title="Cerrar sesión" variant="ghost" style={{ marginTop: space.md }} onPress={signOut} />
      </Screen>
    </View>
  );
}
