import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Bank } from '../api/types';
import { colors, fonts, radius, space } from '../theme';
import { T, webNoOutline } from './ui';

export function BankPicker({
  banks,
  value,
  onChange,
  error,
}: {
  banks: Bank[];
  value: Bank | null;
  onChange: (b: Bank) => void;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = banks.filter((b) => `${b.code} ${b.name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={{ marginBottom: space.md }}>
      <T variant="label" color={colors.textMuted} style={{ marginBottom: 6 }}>
        Banco
      </T>
      <Pressable style={[styles.field, !!error && { borderColor: colors.danger }]} onPress={() => setOpen(true)}>
        <Ionicons name="business-outline" size={18} color={colors.textMuted} />
        <T style={{ flex: 1, marginLeft: space.sm }} color={value ? colors.text : '#A9ABB8'}>
          {value ? `${value.name} (${value.code})` : 'Selecciona tu banco'}
        </T>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <T variant="caption" color={colors.danger} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <T variant="h3">Elige tu banco</T>
          </View>
          <View style={[styles.field, { marginHorizontal: space.md }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              placeholder="Buscar"
              value={q}
              onChangeText={setQ}
              style={styles.search}
              placeholderTextColor="#A9ABB8"
            />
          </View>
          <FlatList
            data={list}
            keyExtractor={(b) => b.code}
            contentContainerStyle={{ padding: space.md }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.item}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <T variant="label" color={colors.textMuted} style={{ width: 48 }}>
                  {item.code}
                </T>
                <T style={{ flex: 1 }}>{item.name}</T>
                {value?.code === item.code ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space.md,
  },
  search: {
    flex: 1,
    minWidth: 0,
    ...webNoOutline,
    marginLeft: space.sm,
    fontFamily: fonts.regular,
    fontSize: 15,
    height: '100%',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
