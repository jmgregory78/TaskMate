import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  onPress: () => void;
  icon?: string;
  color?: string;
  scrollScale?: Animated.Value;
}

export default function FAB({
  onPress,
  icon = '+',
  color = Colors.primary,
  scrollScale,
}: Props) {
  const mountScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(mountScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [mountScale]);

  const transform: Animated.WithAnimatedArray<{ scale: Animated.Value }> =
    scrollScale
      ? [{ scale: mountScale }, { scale: scrollScale }]
      : [{ scale: mountScale }];

  return (
    <Animated.View
      style={[
        styles.container,
        { transform },
        scrollScale ? { opacity: scrollScale } : null,
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.button, { backgroundColor: color }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={styles.icon}>{icon}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36,
    marginTop: -2,
  },
});
