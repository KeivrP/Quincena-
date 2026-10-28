import { View } from 'react-native';
import { colors, space } from '../theme';
import { T } from './ui';

const LABELS = ['Contraseña', 'Contrato', 'Cobro'];

export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
      {LABELS.map((l, k) => (
        <View key={l} style={{ flex: 1 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: k <= current ? colors.white : 'rgba(255,255,255,0.35)',
            }}
          />
          <T variant="caption" color={k <= current ? colors.white : 'rgba(255,255,255,0.7)'} style={{ marginTop: 4 }}>
            {k + 1}. {l}
          </T>
        </View>
      ))}
    </View>
  );
}
