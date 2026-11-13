/**
 * Mobile landing — variant for the elderly end user (S2: simple and easy).
 * Very large type, big touch targets, plain language, and the same content
 * structure as the web variant so the brand stays consistent.
 */

import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand, landingMobile, navSections, type NavSectionId } from '@/content';
import { Palette, Radius, Spacing } from '@/constants/theme';

export default function LandingMobile() {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [offsets, setOffsets] = useState<Partial<Record<NavSectionId, number>> | null>(
    null,
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* Simple navbar: brand chip + one big "Ingresar" button (S5) */}
      <View style={styles.navbar}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>{brand.shortName}</Text>
        </View>
        <Link href="/auth" asChild>
          <Pressable style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Ingresar</Text>
          </Pressable>
        </Link>
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{landingMobile.hero.title}</Text>
          <Text style={styles.heroSubtitle}>{landingMobile.hero.subtitle}</Text>
          <Pressable onPress={() => router.navigate('/auth')} style={styles.heroButton}>
            <Text style={styles.heroButtonText}>{landingMobile.hero.cta}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.navigate('/escanear')}
            style={styles.heroScanButton}>
            <Text style={styles.heroScanText}>📷 Vincularme escaneando un QR</Text>
          </Pressable>
        </View>

        {/* Big section chips instead of small text links */}
        <View style={styles.chipRow}>
          {navSections.map((section) => (
            <Pressable
              key={section.id}
              onPress={() => {
                const y = offsets?.[section.id];
                if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
              }}
              style={styles.chip}>
              <Text style={styles.chipText}>{section.mobileLabel}</Text>
            </Pressable>
          ))}
        </View>

        {/* Visión — pink block, big text */}
        <View
          onLayout={(e) =>
            setOffsets((prev) => ({ ...prev, vision: e.nativeEvent.layout.y - 8 }))
          }
          style={styles.sectionPink}>
          <Text style={styles.sectionTitle}>{landingMobile.vision.title}</Text>
          <Text style={styles.sectionBody}>{landingMobile.vision.body}</Text>
        </View>

        {/* Misión — orange block */}
        <View
          onLayout={(e) =>
            setOffsets((prev) => ({ ...prev, mission: e.nativeEvent.layout.y - 8 }))
          }
          style={styles.sectionOrange}>
          <Text style={styles.sectionTitle}>{landingMobile.mission.title}</Text>
          <Text style={styles.sectionBody}>{landingMobile.mission.body}</Text>
        </View>

        {/* ¿Cómo funciona? — sky block, three big cards */}
        <View
          onLayout={(e) =>
            setOffsets((prev) => ({ ...prev, info: e.nativeEvent.layout.y - 8 }))
          }
          style={styles.sectionSky}>
          <Text style={styles.sectionTitle}>{landingMobile.info.title}</Text>
          {landingMobile.info.steps.map((step) => (
            <View key={step.title} style={styles.stepCard}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{landingMobile.footer}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Palette.surface,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: { color: Palette.textOnBlock, fontWeight: '700' as const, fontSize: 16 },
  loginButton: {
    backgroundColor: Palette.yellow,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderWidth: 2,
    borderColor: Palette.ink,
  },
  loginButtonText: { color: Palette.ink, fontWeight: '800' as const, fontSize: 20 },

  scroll: { flex: 1 },

  hero: {
    backgroundColor: Palette.violet,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  heroTitle: {
    color: Palette.textOnBlock,
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 38,
    marginBottom: Spacing.md,
  },
  heroSubtitle: { color: Palette.textOnBlock, fontSize: 22, lineHeight: 30 },
  heroButton: {
    backgroundColor: Palette.yellow,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.xl,
    borderWidth: 2,
    borderColor: Palette.ink,
  },
  heroButtonText: { color: Palette.ink, fontWeight: '800' as const, fontSize: 22 },
  heroScanButton: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
    borderWidth: 2,
    borderColor: Palette.yellow,
  },
  heroScanText: { color: Palette.ink, fontWeight: '700' as const, fontSize: 18 },

  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    flexWrap: 'wrap' as const,
  },
  chip: {
    backgroundColor: Palette.surfaceAlt,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 2,
    borderColor: Palette.violet,
  },
  chipText: { color: Palette.violet, fontWeight: '700' as const, fontSize: 18 },

  sectionPink: { backgroundColor: Palette.pink, padding: Spacing.lg },
  sectionOrange: { backgroundColor: Palette.orange, padding: Spacing.lg },
  sectionSky: { backgroundColor: Palette.sky, padding: Spacing.lg },
  sectionTitle: {
    color: Palette.textOnBlock,
    fontSize: 28,
    fontWeight: '700' as const,
    marginBottom: Spacing.md,
  },
  sectionBody: {
    color: Palette.textOnBlock,
    fontSize: 22,
    lineHeight: 31,
  },

  stepCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  stepTitle: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: Spacing.sm,
  },
  stepBody: { color: Palette.inkSoft, fontSize: 18, lineHeight: 26 },

  footer: {
    backgroundColor: Palette.violetDark,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  footerText: { color: Palette.textOnBlock, fontSize: 16 },
});
