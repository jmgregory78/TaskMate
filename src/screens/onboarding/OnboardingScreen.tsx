import { useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

function SmokeAlarmIcon() {
  return (
    <Svg width="42" height="42" viewBox="0 0 36 36" fill="none">
      <Rect x="4" y="12" width="28" height="16" rx="8" fill="white" opacity={0.9} />
      <Rect x="8" y="17" width="4" height="2" rx="1" fill="#2D3748" />
      <Rect x="14" y="17" width="4" height="2" rx="1" fill="#2D3748" />
      <Rect x="20" y="17" width="4" height="2" rx="1" fill="#2D3748" />
      <Circle cx="28" cy="20" r="2" fill="#E53E3E" />
      <Path d="M12 10 Q14 6 12 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <Path d="M18 10 Q20 6 18 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <Path d="M24 10 Q26 6 24 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  householdId?: string;
  userId?: string;
  firstName: string;
  onComplete: () => void;
}

export default function OnboardingScreen({
  firstName,
  onComplete,
}: Props) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const TOTAL_PAGES = 6;

  const goToNext = () => {
    if (currentPage < TOTAL_PAGES - 1) {
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({
        x: nextPage * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentPage(nextPage);
    }
  };

  const skip = () => {
    scrollRef.current?.scrollTo({
      x: 5 * SCREEN_WIDTH,
      animated: true,
    });
    setCurrentPage(5);
  };

  return (
    <View style={{ flex: 1 }}>
      {currentPage > 0 && currentPage < 5 && (
        <TouchableOpacity
          onPress={skip}
          style={{
            position: 'absolute',
            top: insets.top + 16,
            right: 20,
            zIndex: 10,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
            Skip
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(
            e.nativeEvent.contentOffset.x / SCREEN_WIDTH
          );
          setCurrentPage(page);
        }}
      >
        {/* PAGE 1: Welcome */}
        <View
          style={[
            styles.page,
            {
              backgroundColor: Colors.headerBackground,
              paddingTop: insets.top,
            },
          ]}
        >
          <View style={styles.welcomeContent}>
            <Text style={{ fontSize: 80 }}>🏠</Text>
            <Text style={styles.welcomeTitle}>Welcome to TaskMate</Text>
            <Text style={styles.welcomeSubtext}>
              Your household memory — for the tasks that are easy to forget
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { marginHorizontal: 28 }]}
            onPress={goToNext}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>

        {/* PAGE 2: Household Tasks */}
        <View style={[styles.page, { backgroundColor: Colors.headerBackground }]}>
          <View style={styles.pageContent}>
            <Text style={styles.bigEmoji}>📋</Text>
            <Text style={[styles.pageTitle, { marginBottom: 6 }]}>
              Household Tasks
            </Text>
            <Text style={[styles.pageSubtext, { marginBottom: 10 }]}>
              The tasks that only come around a few times a year — and cost
              you money or safety when forgotten.
            </Text>
            <Text style={styles.tasksLikeLabel}>Tasks like...</Text>
            <View style={styles.diceGrid}>
              {(
                [
                  {
                    gap: 28,
                    items: [
                      ['🚗', 'Car Service'],
                      ['🌬️', 'Replace Filters'],
                    ],
                  },
                  {
                    gap: 20,
                    items: [
                      ['$', 'Property Taxes'],
                      ['🛁', 'Seal Grout'],
                      ['smoke-alarm', 'Smoke Alarm Battery'],
                    ],
                  },
                  {
                    gap: 28,
                    items: [
                      ['💊', 'Prescription Medication'],
                      ['🛂', 'Renew Passport'],
                    ],
                  },
                ] as const
              ).map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.diceRow, { gap: row.gap }]}>
                  {row.items.map(([emoji, label]) => (
                    <View key={label} style={styles.iconCard}>
                      <View style={styles.iconCircle}>
                        {emoji === 'smoke-alarm' ? (
                          <SmokeAlarmIcon />
                        ) : (
                          <Text
                            style={
                              emoji === '$'
                                ? styles.iconEmojiGold
                                : styles.iconEmoji
                            }
                          >
                            {emoji}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.iconLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View
            style={[
              styles.bottomArea,
              {
                backgroundColor: Colors.headerBackground,
                paddingTop: 16,
              },
            ]}
          >
            {renderDots(currentPage, TOTAL_PAGES)}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={goToNext}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PAGE 3: Smart Reminders */}
        <View style={[styles.page, { backgroundColor: Colors.headerBackground }]}>
          <View style={styles.pageContent}>
            <Text style={styles.bigEmoji}>🔔</Text>
            <Text style={styles.pageTitle}>Custom Reminders</Text>
            <Text style={styles.pageSubtext}>
              Get notified before tasks are due — a day before, a week, even
              a month. If the timing isn't right, snooze it and TaskMate
              will remind you again.
            </Text>
            <View style={styles.bulletList}>
              {[
                'Set custom reminder timing per task',
                'Snooze reminders when life gets busy',
                'Due today alerts so nothing slips through',
              ].map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.bottomArea}>
            {renderDots(currentPage, TOTAL_PAGES)}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={goToNext}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PAGE 4: A Team Effort */}
        <View style={[styles.page, { backgroundColor: Colors.headerBackground }]}>
          <View style={styles.pageContent}>
            <Text style={styles.bigEmoji}>👨‍👩‍👧</Text>
            <Text style={styles.pageTitle}>Share Tasks</Text>
            <Text style={styles.pageSubtext}>
              Share tasks with family members and share the load. Everyone in
              your household can see what needs to get done and mark things
              complete.
            </Text>
            <View style={styles.bulletList}>
              {[
                'Invite family with a simple code or QR',
                'Assign tasks to specific members',
                'Everyone sees what needs to get done',
                'Full activity log of who did what',
              ].map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.bottomArea}>
            {renderDots(currentPage, TOTAL_PAGES)}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={goToNext}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PAGE 5: Never Run Out */}
        <View style={[styles.page, { backgroundColor: Colors.headerBackground }]}>
          <View style={styles.pageContent}>
            <Text style={styles.bigEmoji}>📦</Text>
            <Text style={styles.pageTitle}>Never run out</Text>
            <Text style={styles.pageSubtext}>
              Track the supplies that keep your household running — like your
              prescription medication. TaskMate calculates how many uses you
              have left and warns you before you run out.
            </Text>

            {/* Card 1: Healthy stock */}
            <View style={styles.exampleCard}>
              <Text style={styles.exampleIcon}>💊</Text>
              <View style={styles.exampleBody}>
                <Text style={styles.exampleName}>Prescription Medication</Text>
                <View style={styles.exampleBar}>
                  <View
                    style={[styles.exampleBarFill, { width: '75%' }]}
                  />
                </View>
                <Text style={styles.exampleMeta}>
                  45 of 60 doses remaining
                </Text>
                <Text style={styles.exampleReorder}>
                  Reorder by: June 24, 2026
                </Text>
              </View>
            </View>

            {/* Card 2: Low stock / needs reordering */}
            <View style={[styles.exampleCard, styles.exampleCardWarning]}>
              <Text style={styles.exampleIcon}>❄️</Text>
              <View style={styles.exampleBody}>
                <Text style={styles.exampleName}>HVAC Filters</Text>
                <View style={styles.exampleBar}>
                  <View
                    style={[styles.exampleBarFill, styles.exampleBarFillWarning, { width: '25%' }]}
                  />
                </View>
                <Text style={styles.exampleMeta}>
                  1 of 4 filters remaining
                </Text>
                <Text style={styles.exampleWarning}>
                  ⚠️ Reorder now — running low!
                </Text>
              </View>
            </View>

            <View style={styles.bulletList}>
              {[
                'Track medication, filters, oil, and other essentials',
                'See exactly how many uses remain',
                "Get low stock alerts before it's too late",
                'One tap to reorder from where you buy',
              ].map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.bottomArea}>
            {renderDots(currentPage, TOTAL_PAGES)}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={goToNext}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PAGE 6: Ready to Go */}
        <View
          style={[
            styles.page,
            {
              backgroundColor: Colors.headerBackground,
              paddingTop: insets.top,
            },
          ]}
        >
          <View style={styles.welcomeContent}>
            <Text style={{ fontSize: 72 }}>🎉</Text>
            <Text style={styles.welcomeTitle}>
              {firstName}, you're all set!
            </Text>
            <Text style={styles.welcomeSubtext}>
              Start by adding your first task — TaskMate will take it from
              there.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { marginHorizontal: 28 }]}
            onPress={onComplete}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function renderDots(current: number, total: number) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 10 : 6,
            height: i === current ? 10 : 6,
            borderRadius: i === current ? 5 : 3,
            backgroundColor:
              i === current ? Colors.primary : 'rgba(255,255,255,0.3)',
            marginHorizontal: 3,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  welcomeSubtext: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 24,
  },
  pageContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  bigEmoji: {
    fontSize: 80,
    textAlign: 'center',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  pageSubtext: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  exampleIcon: {
    fontSize: 36,
  },
  exampleBody: {
    flex: 1,
  },
  exampleName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  exampleBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  exampleBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  exampleMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  exampleReorder: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  exampleCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  exampleBarFillWarning: {
    backgroundColor: '#F59E0B',
  },
  exampleWarning: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 4,
  },
  bulletList: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    fontSize: 18,
    color: Colors.primary,
    lineHeight: 22,
    width: 16,
  },
  bulletText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
    lineHeight: 22,
  },
  tasksLikeLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 6,
  },
  diceGrid: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  diceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCard: {
    width: 90,
    height: 110,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 42,
  },
  iconEmojiGold: {
    fontSize: 42,
    color: '#D4AF37',
    fontWeight: '800',
  },
  iconLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    width: 88,
  },
  bottomArea: {
    paddingHorizontal: 28,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
