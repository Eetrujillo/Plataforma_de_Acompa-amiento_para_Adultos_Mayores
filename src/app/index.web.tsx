/**
 * Web landing — variant for the trained caregiver (technical tone, S2).
 * Navbar modules: Visión / Misión / Información + Log in / Sign up in the
 * top-right corner that opens the dedicated /auth page (S4, S5).
 */

import Head from 'expo-router/head';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { brand, landingWeb, navSections, type NavSectionId } from '@/content';
import { MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';

function scrollToSection(id: NavSectionId) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function LandingWeb() {
  return (
    <ScrollView contentContainerStyle={styles.page} style={styles.underlay}>
      <Head>
        <title>{brand.name}</title>
      </Head>

      {/* Navbar */}
      <View style={styles.navbar}>
        <View style={styles.navItemInner}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>{brand.shortName}</Text>
          </View>
          <Text style={styles.brandName}>{brand.name}</Text>
        </View>
        <View style={styles.navLinks}>
          {navSections.map((section) => (
            <Pressable key={section.id} onPress={() => scrollToSection(section.id)}>
              <Text style={styles.navLink}>{section.label}</Text>
            </Pressable>
          ))}
          {/* Log in / Sign up — top-right corner, navigates to the /auth page (S5) */}
          <Pressable onPress={() => scrollToSection('vision')} style={styles.authButton}>
            {({ pressed }) => (
              <Text style={[styles.authButtonText, pressed && styles.authButtonTextPressed]}>
                Log in / Sign up
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Hero — violet energy block */}
      <View style={styles.hero}>
        <View style={styles.blockInner}>
          <Text style={styles.heroKicker}>{landingWeb.hero.kicker}</Text>
          <Text style={[styles.heroTitle, styles.lightText]}>{landingWeb.hero.title}</Text>
          <Text style={[styles.heroSubtitle, styles.lightText]}>{landingWeb.hero.subtitle}</Text>
          <View style={styles.heroActions}>
            <View style={styles.heroButtonRow}>
              <Pressable
                onPress={() => scrollToSection('info')}
                style={styles.heroPrimaryButton}>
                <Text style={styles.heroPrimaryButtonText}>
                  {landingWeb.hero.ctaSecondary}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Visión — pink block */}
      <View style={[styles.section, { backgroundColor: Palette.pink }]}>
        <View style={styles.blockInner}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{landingWeb.vision.title}</Text>
          </View>
          <Text style={[styles.sectionBody, styles.lightText]}>{landingWeb.vision.body}</Text>
        </View>
      </View>

      {/* Misión — orange block */}
      <View style={[styles.section, { backgroundColor: Palette.orange }]}>
        <View style={styles.blockInner}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: Palette.violet }]}>
              {landingWeb.mission.title}
            </Text>
          </View>
          <Text style={[styles.sectionBody, styles.lightText]}>{landingWeb.mission.body}</Text>
        </View>
      </View>

      {/* Información — sky block with step cards */}
      <View style={[styles.section, { backgroundColor: Palette.sky }]}>
        <View style={styles.blockInner}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{landingWeb.info.title}</Text>
          </View>
          <Text style={[styles.sectionBody, styles.lightText]}>{landingWeb.info.lead}</Text>
          <View style={styles.stepRow}>
            {landingWeb.info.steps.map((step) => (
              <View key={step.title} style={styles.stepCard}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.infoNote, styles.lightText]}>{landingWeb.info.note}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.blockInner}>
          <Text style={[styles.footerText, styles.lightText]}>{landingWeb.footer}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const navItemHeight = 64;

const styles = StyleSheet.create({
  underlay: { backgroundColor: Palette.ink },
  page: { minHeight: Platform.OS === 'web' ? '100%' : undefined },

  /* Navbar (sticky on web via pointer-events-free wrapper below; simple in-page bar v1) */
  navbar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: navItemHeight,
    backgroundColor: Palette.ink,
    paddingHorizontal: Spacing.lg,
  },
  navItemInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Palette.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: { color: Palette.ink, fontWeight: '700' as const, fontSize: 15 },
  brandName: {
    color: Palette.textOnBlock,
    fontWeight: '600' as const,
    fontSize: 16,
    maxWidth: 320,
  },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  navLink: {
    color: Palette.textOnBlock,
    fontSize: 15,
    opacity: 0.9,
  },
  authButton: {
    borderWidth: 2,
    borderColor: Palette.yellow,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'transparent',
  },
  authButtonText: {
    color: Palette.yellow,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  authButtonTextPressed: { opacity: 0.7 },

  /* Shared color blocks */
  hero: { backgroundColor: Palette.violet, width: '100%' },
  blockInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  lightText: { color: Palette.textOnBlock },
  section: { width: '100%' },
  sectionHeader: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: 34,
    fontWeight: '700' as const,
    color: Palette.textOnBlock,
    letterSpacing: -0.5,
  },
  sectionBody: { fontSize: 17, lineHeight: 27, maxWidth: 720 },

  /* Hero */
  heroKicker: {
    color: Palette.yellow,
    fontSize: 15,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 50,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  heroSubtitle: { fontSize: 18, lineHeight: 28, maxWidth: 640, opacity: 0.95 },
  heroActions: { flexDirection: 'row', marginTop: Spacing.xl },
  heroButtonRow: { flexDirection: 'row' },
  heroPrimaryButton: {
    backgroundColor: Palette.yellow,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  heroPrimaryButtonText: {
    color: Palette.ink,
    fontWeight: '700' as const,
    fontSize: 16,
  },

  /* Info steps */
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    flexWrap: 'wrap' as const,
  },
  stepCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Palette.ink,
    marginBottom: Spacing.sm,
  },
  stepBody: { fontSize: 15, lineHeight: 22, color: Palette.inkSoft },
  infoNote: { marginTop: Spacing.lg, fontSize: 14, opacity: 0.85 },

  /* Footer */
  footer: { backgroundColor: Palette.violetDark, width: '100%' },
  footerText: { fontSize: 14, opacity: 0.85, paddingBottom: Spacing.xl },
});
