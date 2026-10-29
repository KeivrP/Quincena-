import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { USE_MOCK } from '../../api/config';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { CreditAgreement } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Steps } from '../../components/Steps';
import { Banner, Button, Card, OrangeHeader, Screen, T } from '../../components/ui';
import { colors, radius, space } from '../../theme';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 del PDF exacto que el trabajador vio. La URL es prefirmada: GET sin Authorization. */
async function hashPdf(url: string): Promise<string> {
  if (USE_MOCK) return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('expired');
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await res.arrayBuffer()));
}

export default function ContractScreen() {
  const { refreshProfile } = useAuth();
  const [contract, setContract] = useState<CreditAgreement | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await appApi.creditAgreement();
      setContract(c);
      return c;
    } catch (e) {
      setError(messageFor(e));
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async () => {
    // Pedimos una URL fresca cada vez: las prefirmadas vencen en ~1 h.
    const c = (await load()) ?? contract;
    if (!c) return;
    await WebBrowser.openBrowserAsync(c.download_url);
    setOpened(true);
  };

  const sign = async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = (await load()) ?? contract;
      if (!fresh) return;
      const hash = await hashPdf(fresh.download_url);
      if (fresh.pdf_sha256 && fresh.pdf_sha256.toLowerCase() !== hash) {
        throw new Error('El documento cambió. Ábrelo de nuevo antes de firmar.');
      }
      await appApi.signCreditAgreement(hash);
      await refreshProfile();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error && !('problem' in e) ? e.message : messageFor(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Contrato marco" back={false} subtitle="Se firma una sola vez">
        <Steps current={1} />
      </OrangeHeader>
      <Screen edges={[]}>
        {error ? (
          <View style={{ marginBottom: space.md }}>
            <Banner tone="error" message={error} />
          </View>
        ) : null}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="document-text" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">Contrato marco de crédito</T>
              <T variant="caption" color={colors.textMuted}>
                PDF · Regula todos tus créditos futuros
              </T>
            </View>
            {!contract ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
          <Button
            title={opened ? 'Ver de nuevo' : 'Leer contrato'}
            variant="outline"
            icon="eye-outline"
            style={{ marginTop: space.md }}
            onPress={open}
            disabled={!contract}
          />
        </Card>

        <View style={{ marginTop: space.md, gap: space.sm }}>
          {[
            'Las cuotas se descuentan de tu nómina o las pagas por pago móvil.',
            'Ninguna cuota puede superar 1/3 de tu salario (LOTTT art. 154).',
            'Firmas una sola vez; cada crédito nuevo usa este mismo contrato.',
          ].map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: space.sm }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <T style={{ flex: 1 }}>{t}</T>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => setAccepted((a) => !a)}
          style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.lg }}
        >
          <Ionicons
            name={accepted ? 'checkbox' : 'square-outline'}
            size={22}
            color={accepted ? colors.primary : colors.textMuted}
          />
          <T style={{ flex: 1 }}>He leído el contrato y acepto sus condiciones.</T>
        </Pressable>

        <Button
          title="Firmar contrato"
          icon="create-outline"
          style={{ marginTop: space.lg }}
          disabled={!accepted || !contract}
          loading={loading}
          onPress={sign}
        />
        {!opened ? (
          <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
            Te recomendamos leerlo completo antes de firmar.
          </T>
        ) : null}
      </Screen>
    </View>
  );
}
