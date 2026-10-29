import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { Bank } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { BankPicker } from '../../components/BankPicker';
import { Steps } from '../../components/Steps';
import { Banner, Button, Card, Field, OrangeHeader, Screen } from '../../components/ui';
import { isValidCedula, isValidPhone, normalizeCedula, normalizePhone } from '../../lib/validators';
import { colors, space } from '../../theme';

/** También se usa desde Perfil para actualizar los datos de cobro (?edit=1). */
export default function Payout() {
  const { profile, refreshProfile } = useAuth();
  const editing = !!profile?.payout_registered;
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const [phone, setPhone] = useState('');
  const [cedula, setCedula] = useState(profile?.national_id ?? '');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCurrent = useCallback(async (list: Bank[]) => {
    try {
      const current = await appApi.payoutAccount();
      if (current.phone) setPhone(current.phone);
      if (current.national_id) setCedula(current.national_id);
      if (current.bank_code) setBank(list.find((x) => x.code === current.bank_code) ?? null);
    } catch {
      // Sin cuenta registrada aún: formulario vacío, no es un error.
    }
  }, []);

  useEffect(() => {
    appApi
      .banks()
      .then(async (b) => {
        setBanks(b);
        await loadCurrent(b);
      })
      .catch((e) => setError(messageFor(e)));
  }, [loadCurrent]);

  const submit = async () => {
    const errs: Record<string, string | null> = {
      bank: bank ? null : 'Selecciona un banco.',
      phone: isValidPhone(phone) ? null : 'Debe ser un móvil venezolano (0412, 0414, 0416, 0424, 0426).',
      cedula: isValidCedula(cedula) ? null : 'Formato: V12345678.',
    };
    if (!errs.cedula && profile?.national_id && normalizeCedula(cedula) !== normalizeCedula(profile.national_id)) {
      errs.cedula = 'Debe ser tu propia cédula.';
    }
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setLoading(true);
    setError(null);
    try {
      await appApi.savePayoutAccount({
        bank_code: bank!.code,
        phone: normalizePhone(phone),
        national_id: normalizeCedula(cedula),
      });
      await refreshProfile();
      router.replace(editing ? '/profile' : '/');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="¿Dónde quieres cobrar?" back={editing} subtitle="Tu pago móvil para recibir los créditos">
        {!editing ? <Steps current={2} /> : null}
      </OrangeHeader>
      <Screen edges={[]}>
        {error ? (
          <View style={{ marginBottom: space.md }}>
            <Banner tone="error" message={error} />
          </View>
        ) : null}
        <Card>
          <BankPicker banks={banks} value={bank} onChange={setBank} error={errors.bank} />
          <Field
            label="Teléfono de pago móvil"
            icon="phone-portrait-outline"
            placeholder="0414 1234567"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            error={errors.phone}
          />
          <Field
            label="Cédula"
            icon="card-outline"
            placeholder="V12345678"
            autoCapitalize="characters"
            value={cedula}
            onChangeText={setCedula}
            error={errors.cedula}
            hint="Debe ser la tuya: el banco valida que coincida."
          />
          <Button title={editing ? 'Guardar cambios' : 'Guardar y empezar'} onPress={submit} loading={loading} />
        </Card>
        <View style={{ marginTop: space.md }}>
          <Banner
            tone="info"
            message="Si también eres cliente de Banco Activo, recibes el dinero al instante por P2P."
          />
        </View>
      </Screen>
    </View>
  );
}
