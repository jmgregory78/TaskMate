import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface Props {
  taskName: string;
  taskIcon: string;
  visible: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

export default function TaskCompletedOverlay({
  taskName,
  taskIcon,
  visible,
  onDismiss,
}: Props) {
  const iconScale = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    dismissedRef.current = false;
    iconScale.setValue(0);
    checkScale.setValue(0);
    textOpacity.setValue(0);

    Animated.sequence([
      Animated.delay(120),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(200),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(420),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleDismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay}>
          <Animated.Text
            style={[styles.taskIcon, { transform: [{ scale: iconScale }] }]}
          >
            {taskIcon}
          </Animated.Text>

          <Animated.View
            style={[
              styles.checkCircle,
              { transform: [{ scale: checkScale }] },
            ]}
          >
            <Text style={styles.check}>✓</Text>
          </Animated.View>

          <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
            <Text style={styles.taskName}>{taskName}</Text>
            <Text style={styles.completed}>Completed!</Text>
            <Text style={styles.hint}>Tap anywhere to dismiss</Text>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 103, 73, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  taskIcon: {
    fontSize: 72,
    marginBottom: 16,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontSize: 48,
    color: '#276749',
    fontWeight: '700',
    lineHeight: 56,
  },
  taskName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
  },
  completed: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 32,
  },
});
