import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Image, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Illustration } from '../components/Illustration';
import { Button, Logo, RoundArrowButton, T } from '../components/ui';
import { colors, space } from '../theme';

type IconName = ComponentProps<typeof Illustration>['icon'];
type Slide = {
  title: string;
  text: string;
  image?: ImageSourcePropType;
  illustration?: { icon: IconName; badges: { icon: IconName; color: string }[] };
};

const SLIDES: Slide[] = [
  {
    image: require('../../assets/images/hero-book.png'),
    title: 'Crédito al instante',
    text: 'Pide un adelanto sobre tu nómina y recíbelo en tu pago móvil en segundos.',
  },
  {
    illustration: {
      icon: 'phone-portrait',
      badges: [
        { icon: 'calculator', color: colors.primary },
        { icon: 'cash', color: colors.accent },
        { icon: 'receipt', color: colors.warning },
      ],
    },
    title: 'Todo desde tu teléfono',
    text: 'Simula, solicita y paga tus cuotas sin papeleo ni filas en el banco.',
  },
  {
    illustration: {
      icon: 'shield-checkmark',
      badges: [
        { icon: 'lock-closed', color: colors.primary },
        { icon: 'eye', color: colors.accent },
        { icon: 'finger-print', color: colors.warning },
      ],
    },
    title: 'Claro y seguro',
    text: 'Ves tu cupo, tus cuotas y cada abono. Tus datos viajan cifrados.',
  },
];

export default function Welcome() {
  const [i, setI] = useState(0);
  const { height } = useWindowDimensions();
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Logo size={34} />
          <T variant="h3">
            Quincena
            <T variant="h3" color={colors.accent}>
              +
            </T>
          </T>
        </View>
        {!last ? (
          <T variant="label" color={colors.textMuted} onPress={() => router.push('/login')}>
            Saltar
          </T>
        ) : null}
      </View>

      <View style={[styles.heroWrap, { height: height * 0.46 }]}>
        {slide.image ? (
          <>
            <View style={[styles.blob, styles.blobRight]} />
            <Image source={slide.image} style={styles.hero} resizeMode="contain" />
          </>
        ) : slide.illustration ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Illustration icon={slide.illustration.icon} size={240} badges={slide.illustration.badges} />
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: space.lg, alignItems: 'center' }}>
        <T variant="h1" style={{ textAlign: 'center' }}>
          {slide.title}
        </T>
        <T color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
          {slide.text}
        </T>
        <View style={styles.dots}>
          {SLIDES.map((_, k) => (
            <View key={k} style={[styles.dot, k === i && styles.dotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        {last ? (
          <View style={{ width: '100%', gap: space.sm }}>
            <Button title="Iniciar sesión" onPress={() => router.push('/login')} />
            <Button
              title="Me llegó un correo de bienvenida"
              variant="ghost"
              onPress={() => router.push('/check-email')}
            />
          </View>
        ) : (
          <RoundArrowButton dark={i === 1} onPress={() => setI(i + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  heroWrap: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden', marginTop: space.md },
  blob: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 120,
    backgroundColor: colors.primary,
    top: -140,
  },
  blobRight: { transform: [{ rotate: '45deg' }], right: -150 },
  blobLeft: { transform: [{ rotate: '-45deg' }], left: -150 },
  hero: { width: '78%', height: '92%' },
  dots: { flexDirection: 'row', gap: 6, marginTop: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E2E8' },
  dotActive: { width: 22, backgroundColor: colors.primary },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: space.lg },
});
