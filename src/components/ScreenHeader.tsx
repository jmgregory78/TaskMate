import { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

interface Props {
  title: string;
  leftLabel?: string;
  onLeftPress?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
  rightContent?: ReactNode;
  rightDisabled?: boolean;
  rightTone?: 'teal' | 'white';
  style?: ViewStyle;
}

export default function ScreenHeader({
  title,
  leftLabel,
  onLeftPress,
  rightLabel,
  onRightPress,
  rightContent,
  rightDisabled,
  rightTone = 'teal',
  style,
}: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const handleLeft = onLeftPress ?? (() => navigation.goBack());

  return (
    <View
      style={[
        styles.wrapper,
        { paddingTop: insets.top, height: 56 + insets.top },
        style,
      ]}
    >
      <TouchableOpacity
        onPress={handleLeft}
        activeOpacity={0.7}
        style={styles.leftButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.leftText}>‹ {leftLabel ?? 'Back'}</Text>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {title}
      </Text>

      <View style={styles.rightSlot}>
        {rightContent ? (
          rightContent
        ) : rightLabel ? (
          <TouchableOpacity
            onPress={onRightPress}
            disabled={rightDisabled}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={[
                styles.rightText,
                rightTone === 'white' ? styles.rightTextWhite : styles.rightTextTeal,
                rightDisabled && styles.rightDisabled,
              ]}
            >
              {rightLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.headerBackground,
  },
  leftButton: {
    minWidth: 80,
  },
  leftText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    ...Typography.h3,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  rightSlot: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  rightText: {
    fontSize: 16,
    fontWeight: '700',
  },
  rightTextTeal: {
    color: Colors.primary,
  },
  rightTextWhite: {
    color: '#FFFFFF',
  },
  rightDisabled: {
    opacity: 0.4,
  },
});
