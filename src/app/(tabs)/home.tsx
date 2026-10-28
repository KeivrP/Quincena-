import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appApi } from '../../api/endpoints';
import { messageFor } from '../../api/errors';
import type { Loan } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { CreditCard } from '../../components/CreditCard';
import { Banner, Card, EmptyState, ProgressBar, T } from '../../components/ui';
import { formatUsd, ratio } from '../../lib/money';
import { colors, radius, shadow, space } from '../../theme';

const ACTIONS = [
  { icon: 'flash', label: 'Solicitar', to: '/request' },
  { icon: 'calculator', label: 'Simular', to: '/request?simulate=1' },
  { icon: 'arrow-up-circle', label: 'Reportar pago', to: '/report-payment' },
  { icon: 'list', label: 'Créditos', to: '/credits' },
] as const;

export default function Home() {
  const { profile, refreshProfile } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [, loanList] = await Promise.all([refreshProfile(), appApi.loans()]);
      setLoans(loanList);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const usedPct = ratio(profile?.credit_used_usd, profile?.credit_limit_usd);
  const active = loans.filter((l) => l.status === 'active');
  const pay = profile?.payment_destination;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <T variant="h3" color={colors.primary}>
                {firstName.charAt(0) || '·'}
              </T>
            </View>
            <View style={{ flex: 1, marginLeft: space.sm }}>
              <T variant="caption" color={colors.onPrimaryMuted}>
                {profile?.company_legal_name ?? 'Bienvenido'}
              </T>
              <T variant="h3" color={colors.white}>
                Hola, {firstName}
              </T>
            </View>
            <Ionicons name="notifications-outline" size={22} color={colors.white} />
          </View>
        </SafeAreaView>
        <View style={{ paddingHorizontal: space.md }}>
          <LinearGradient
            colors={[colors.navySoft, colors.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balance}
          >
            <View style={styles.balanceGlow} />
            <T variant="label" color="rgba(255,255,255,0.7)">
              Cupo disponible
            </T>
            <T variant="amount" color={colors.white} style={{ marginTop: 2 }}>
              {formatUsd(profile?.credit_available_usd)}
            </T>
            <View style={{ marginTop: space.md }}>
              <ProgressBar value={usedPct} color={colors.accent} track="rgba(255,255,255,0.15)" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
              <T variant="caption" color="rgba(255,255,255,0.7)">
                Usado {formatUsd(profile?.credit_used_usd)}
              </T>
              <T variant="caption" color="rgba(255,255,255,0.7)">
                Límite {formatUsd(profile?.credit_limit_usd)}
              </T>
            </View>
          </LinearGradient>

          {error ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="error" message={error} />
            </View>
          ) : null}

          <View style={styles.actions}>
            {ACTIONS.map((a) => (
              <Pressable key={a.label} style={styles.action} onPress={() => router.push(a.to)}>
                <View style={styles.actionIcon}>
                  <Ionicons name={a.icon} size={22} color={colors.primary} />
                </View>
                <T variant="caption" style={{ marginTop: 6, textAlign: 'center' }}>
                  {a.label}
                </T>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHead}>
            <T variant="h3">Créditos activos</T>
            {active.length ? (
              <T variant="label" color={colors.primary} onPress={() => router.push('/credits')}>
                Ver todos
              </T>
            ) : null}
          </View>
          {active.length ? (
            active.slice(0, 3).map((c) => <CreditCard key={c.id} credit={c} />)
          ) : (
            <Card>
              <EmptyState
                icon="sparkles"
                title="Sin créditos activos"
                message="Toca el botón + para pedir tu primer crédito."
              />
            </Card>
          )}

          {pay ? (
            <Card style={{ marginTop: space.sm }}>
              <T variant="h3" style={{ marginBottom: space.xs }}>
                ¿Cómo pago mis cuotas?
              </T>
              <T color={colors.textMuted} style={{ marginBottom: space.sm }}>
                Haz un pago móvil a la cuenta de tu empresa y repórtalo aquí:
              </T>
              <T variant="label">
                {pay.bank_code} · {pay.phone}
              </T>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.md,
    paddingBottom: 70,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: space.sm },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balance: { borderRadius: radius.xl, padding: space.lg, marginTop: -56, overflow: 'hidden', ...shadow },
  balanceGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
    opacity: 0.25,
    right: -60,
    top: -70,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg },
  action: { width: '23%', alignItems: 'center' },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.lg,
    marginBottom: space.md,
  },
});
