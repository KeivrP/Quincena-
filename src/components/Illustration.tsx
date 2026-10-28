import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { colors } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Ilustración vectorial: círculos concéntricos, ícono central y pequeñas insignias flotantes. */
export function Illustration({
  icon,
  tint = colors.primary,
  soft = colors.primarySoft,
  badges = [],
  size = 200,
  spinning = false,
}: {
  icon: IconName;
  tint?: string;
  soft?: string;
  badges?: readonly { icon: IconName; color: string }[];
  size?: number;
  spinning?: boolean;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinning) return;
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spinning, spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const inner = size * 0.46;
  // Insignias repartidas alrededor del círculo.
  const positions = [
    { top: size * 0.04, right: size * 0.06 },
    { bottom: size * 0.1, left: size * 0.02 },
    { top: size * 0.3, left: -size * 0.04 },
    { bottom: size * 0.02, right: size * 0.12 },
  ];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: soft,
          opacity: 0.6,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 0.78,
          height: size * 0.78,
          borderRadius: size,
          borderWidth: 3,
          borderStyle: spinning ? 'dashed' : 'solid',
          borderColor: spinning ? tint : soft,
          backgroundColor: colors.white,
          transform: [{ rotate }],
        }}
      />
      <Animated.View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}
      >
        <Ionicons name={icon} size={inner * 0.5} color={colors.white} />
      </Animated.View>
      {badges.slice(0, 4).map((b, k) => (
        <View
          key={k}
          style={{
            position: 'absolute',
            ...positions[k],
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.06,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0A1F44',
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          }}
        >
          <Ionicons name={b.icon} size={size * 0.1} color={b.color} />
        </View>
      ))}
    </View>
  );
}
