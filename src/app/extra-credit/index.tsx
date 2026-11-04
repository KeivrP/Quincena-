import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { ExtraCreditRequest } from '../../api/types';
import { ExtraCreditCard } from '../../components/ExtraCreditCard';
import { Banner, Button, Card, EmptyState, OrangeHeader } from '../../components/ui';
import { colors, space } from '../../theme';

export default function ExtraCreditList() {
  const [items, setItems] = useState<ExtraCreditRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await appApi.extraCreditRequests());
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasPending = items?.some((r) => r.status === 'pending') ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Mis extra-créditos" subtitle="Montos por encima de tu cupo" />
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: space.md, paddingBottom: space.xl * 2 }}
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
          {error ? <Banner tone="error" message={error} /> : null}
          {!items && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} /> : null}
          {items && items.length === 0 ? (
            <Card>
              <EmptyState
                icon="trending-up"
                title="Sin solicitudes"
                message="Si necesitas más de tu cupo, puedes pedir un extra-crédito y RRHH lo revisa."
              />
            </Card>
          ) : null}
          {items?.map((r) => (
            <ExtraCreditCard key={r.id} request={r} />
          ))}
          {items && !hasPending ? (
            <Button
              title="Pedir un extra-crédito"
              icon="add"
              variant="outline"
              style={{ marginTop: space.md }}
              onPress={() => router.push('/extra-credit/new')}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
