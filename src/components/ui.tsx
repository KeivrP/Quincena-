import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow, space } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

// En web (solo vista previa) quitamos el borde de foco del navegador; el campo ya marca el foco.
export const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

// ---------- Texto ----------
type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'label' | 'caption' | 'amount';
const variantStyles: Record<Variant, TextStyle> = {
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34 },
  h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  amount: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
};

export function T({
  variant = 'body',
  color = colors.text,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[variantStyles[variant], { color }, style]} />;
}

// ---------- Contenedores ----------
export function Screen({
  children,
  scroll = true,
  bg = colors.bg,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  bg?: string;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ padding: space.md, paddingBottom: space.xl * 2 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding: space.md }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Cabecera naranja con esquinas redondeadas, como en el Figma. */
export function OrangeHeader({
  title,
  subtitle,
  back = true,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
        <T variant="h3" color={colors.white} style={{ flex: 1, marginLeft: space.md }}>
          {title}
        </T>
        {right}
      </View>
      {subtitle ? (
        <T color="#FFE3D6" style={{ marginTop: space.xs, marginLeft: 22 + space.md }}>
          {subtitle}
        </T>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

// ---------- Botones ----------
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, outline: 'transparent', ghost: 'transparent', dark: colors.navy }[variant];
  const fg = variant === 'outline' || variant === 'ghost' ? colors.primary : colors.white;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <T variant="h3" color={fg} style={{ fontSize: 15 }}>
            {title}
          </T>
        </View>
      )}
    </Pressable>
  );
}

export function RoundArrowButton({ onPress, dark }: { onPress: () => void; dark?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.roundOuter, dark && { borderColor: colors.navy }]}>
      <View style={[styles.roundInner, dark && { backgroundColor: colors.navy }]}>
        <Ionicons name="arrow-forward" size={22} color={colors.white} />
      </View>
    </Pressable>
  );
}

// ---------- Campos ----------
export function Field({
  label,
  icon,
  error,
  secure,
  hint,
  ...rest
}: TextInputProps & { label?: string; icon?: IconName; error?: string | null; secure?: boolean; hint?: string }) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? (
        <T variant="label" color={colors.textMuted} style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View
        style={[styles.field, focused && { borderColor: colors.primary }, !!error && { borderColor: colors.danger }]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: space.sm }} /> : null}
        <TextInput
          placeholderTextColor="#A9ABB8"
          {...rest}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, rest.style]}
        />
        {secure ? (
          <Pressable hitSlop={10} onPress={() => setHidden((h) => !h)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <T variant="caption" color={colors.danger} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

// ---------- Avisos ----------
export function Banner({
  tone = 'info',
  title,
  message,
  icon,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning';
  title?: string;
  message: string;
  icon?: IconName;
}) {
  const palette = {
    info: [colors.primarySoft, colors.primaryDark, 'information-circle'],
    error: [colors.dangerSoft, colors.danger, 'alert-circle'],
    success: [colors.successSoft, colors.success, 'checkmark-circle'],
    warning: [colors.warningSoft, colors.warning, 'time'],
  }[tone] as [string, string, IconName];
  return (
    <View style={[styles.banner, { backgroundColor: palette[0] }]}>
      <Ionicons name={icon ?? palette[2]} size={20} color={palette[1]} />
      <View style={{ flex: 1 }}>
        {title ? (
          <T variant="label" color={palette[1]}>
            {title}
          </T>
        ) : null}
        <T variant="caption" color={colors.text}>
          {message}
        </T>
      </View>
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const [bg, fg] = {
    neutral: ['#EEEEF3', colors.textMuted],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    brand: [colors.primarySoft, colors.primaryDark],
  }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T variant="caption" color={fg} style={{ fontFamily: fonts.medium }}>
        {label}
      </T>
    </View>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <T color={colors.textMuted}>{label}</T>
      <T variant={strong ? 'h3' : 'label'} style={{ color: colors.text }}>
        {value}
      </T>
    </View>
  );
}

export function ProgressBar({
  value,
  color = colors.primary,
  track = '#EEEEF3',
}: {
  value: number;
  color?: string;
  track?: string;
}) {
  return (
    <View style={{ height: 8, backgroundColor: track, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ width: `${value}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function Logo({ size = 64, light }: { size?: number; light?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: light ? colors.white : colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <T
          style={{ fontFamily: fonts.bold, fontSize: size * 0.55, lineHeight: size * 0.7 }}
          color={light ? colors.primary : colors.white}
        >
          X
        </T>
        <View
          style={{
            position: 'absolute',
            top: size * 0.16,
            right: size * 0.16,
            width: size * 0.16,
            height: size * 0.16,
            borderRadius: size,
            backgroundColor: colors.navy,
          }}
        />
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl }}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <T variant="h3" style={{ marginTop: space.md }}>
        {title}
      </T>
      <T color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.xs }}>
        {message}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, ...shadow },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: space.sm },
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  roundOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  input: {
    flex: 1,
    minWidth: 0,
    ...webNoOutline,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    height: '100%',
  },
  banner: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
