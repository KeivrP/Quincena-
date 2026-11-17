import { useState } from 'react';
import { View } from 'react-native';
import { ApiError, fieldMessage, messageFor } from '../api/errors';
import { authApi } from '../api/endpoints';
import { PASSWORD_RULES, passwordIssues } from '../lib/validators';
import { colors, space } from '../theme';
import { Banner, Button, Card, Field, T } from './ui';

type Errors = { current?: string; next?: string; repeat?: string };

/**
 * Cambio de contraseña (guía §4.5). Sirve para el primer ingreso (contraseña temporal) y para el
 * cambio desde Perfil. Aplica la misma política que el servidor y muestra sus errores por campo:
 * la actual incorrecta es un 422 `invalid_current_password` (NO cierra la sesión).
 */
export function ChangePasswordForm({ temporary, onDone }: { temporary: boolean; onDone: () => Promise<void> | void }) {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const issues = passwordIssues(pw);

  const submit = async () => {
    const next: Errors = {};
    if (!current)
      next.current = temporary
        ? 'Escribe la contraseña temporal que te llegó por correo.'
        : 'Escribe tu contraseña actual.';
    if (issues.length) next.next = `Tu contraseña necesita: ${issues.join(', ').toLowerCase()}.`;
    else if (pw === current) next.next = 'La nueva contraseña debe ser distinta a la actual.';
    if (pw !== pw2) next.repeat = 'Las contraseñas no coinciden.';
    setErrors(next);
    setError(null);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await authApi.changePassword(current, pw);
      setCurrent('');
      setPw('');
      setPw2('');
      await onDone();
    } catch (e) {
      const currentMsg = fieldMessage(e, 'current_password', {
        invalid_current_password: temporary
          ? 'La contraseña temporal no es correcta.'
          : 'Tu contraseña actual no es correcta.',
      });
      const newMsg = fieldMessage(e, 'new_password', { string_too_short: 'Debe tener al menos 8 caracteres.' });
      if (currentMsg || newMsg) setErrors({ current: currentMsg, next: newMsg });
      else setError(messageFor(e) + (e instanceof ApiError && e.retryable ? ' Puedes reintentar.' : ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      {error ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="error" message={error} />
        </View>
      ) : null}
      <Field
        label={temporary ? 'Contraseña temporal' : 'Contraseña actual'}
        icon="key-outline"
        secure
        autoComplete="current-password"
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
      />
      <Field
        label="Nueva contraseña"
        icon="lock-closed-outline"
        secure
        autoComplete="new-password"
        maxLength={128}
        value={pw}
        onChangeText={setPw}
        error={errors.next}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: space.md }}>
        {PASSWORD_RULES.map((rule) => {
          const ok = pw.length > 0 && !issues.includes(rule);
          return (
            <T key={rule} variant="caption" color={ok ? colors.success : colors.textMuted}>
              {ok ? '✓' : '•'} {rule}
            </T>
          );
        })}
        <T variant="caption" color={colors.textMuted}>
          • Sin espacios al inicio ni al final
        </T>
      </View>
      <Field
        label="Repite la contraseña"
        icon="lock-closed-outline"
        secure
        autoComplete="new-password"
        value={pw2}
        onChangeText={setPw2}
        error={errors.repeat}
      />
      <Button title={temporary ? 'Guardar y continuar' : 'Cambiar contraseña'} onPress={submit} loading={loading} />
    </Card>
  );
}
