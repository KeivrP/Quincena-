import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nextOnboardingStep, useAuth } from '../../auth/AuthProvider';
import { colors } from '../../theme';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  home: ['home', 'home-outline'],
  credits: ['wallet', 'wallet-outline'],
  payments: ['receipt', 'receipt-outline'],
  profile: ['person', 'person-outline'],
};

// Barra inferior naranja con botón central "+" como en el Figma.
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        style={styles.item}
        onPress={() => {
          const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
        }}
      >
        <Ionicons name={focused ? on : off} size={24} color={focused ? colors.white : 'rgba(255,255,255,0.7)'} />
        {focused ? <View style={styles.dot} /> : null}
      </Pressable>
    );
  });
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.slice(0, 2)}
      <View style={styles.item}>
        <Pressable accessibilityLabel="Solicitar crédito" style={styles.fab} onPress={() => router.push('/request')}>
          <Ionicons name="add" size={30} color={colors.white} />
        </Pressable>
      </View>
      {items.slice(2)}
    </View>
  );
}

export default function TabsLayout() {
  const { status, profile, mustChangePassword } = useAuth();
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  const step = nextOnboardingStep(profile, mustChangePassword);
  if (step) return <Redirect href={step} />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="home" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="credits" options={{ title: 'Créditos' }} />
      <Tabs.Screen name="payments" options={{ title: 'Abonos' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingTop: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.white, marginTop: 4 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.navy,
    borderWidth: 4,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -38,
  },
});
