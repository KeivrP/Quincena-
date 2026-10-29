import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { Loan } from '../../api/types';
import { CreditCard } from '../../components/CreditCard';
import { Banner, EmptyState, OrangeHeader } from '../../components/ui';
import { colors, space } from '../../theme';

export default function Credits() {
  const [items, setItems] = useState<Loan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await appApi.loans());
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Mis créditos" back={false} />
      {items === null && !error ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.md, paddingBottom: 120 }}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          ListHeaderComponent={error ? <Banner tone="error" message={error} /> : undefined}
          ListEmptyComponent={
            <EmptyState
              icon="wallet-outline"
              title="Aún no tienes créditos"
              message="Cuando pidas uno, lo verás aquí con su cronograma."
            />
          }
          renderItem={({ item }) => <CreditCard credit={item} />}
        />
      )}
    </View>
  );
}
