import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Rect,
} from 'react-native-svg';
import { Colors } from '../constants/colors';

interface Props {
  visible: boolean;
}

export default function SplashScreen({ visible }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (visible) {
      opacity.setValue(1);
      setShouldRender(true);
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [visible, opacity]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.illustration}>
        <Svg width={200} height={240} viewBox="0 0 200 240">
          <Ellipse
            cx={100}
            cy={222}
            rx={70}
            ry={6}
            fill="#000"
            opacity={0.25}
          />
          <G transform="rotate(-4 100 110)">
            <Rect
              x={42}
              y={32}
              width={120}
              height={160}
              rx={8}
              ry={8}
              fill="#234E52"
            />
            <Rect
              x={46}
              y={32}
              width={120}
              height={160}
              rx={8}
              ry={8}
              fill={Colors.primary}
            />
            <Rect
              x={46}
              y={32}
              width={20}
              height={160}
              fill="#234E52"
              opacity={0.5}
            />
            <Circle cx={56} cy={62} r={6} fill="#D4AF37" />
            <Circle cx={56} cy={62} r={3} fill="#234E52" />
            <Circle cx={56} cy={112} r={6} fill="#D4AF37" />
            <Circle cx={56} cy={112} r={3} fill="#234E52" />
            <Circle cx={56} cy={162} r={6} fill="#D4AF37" />
            <Circle cx={56} cy={162} r={3} fill="#234E52" />
            <Path
              d="M92 112 L108 132 L138 92"
              stroke="#D4AF37"
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </G>
          <G transform="rotate(35 150 60)">
            <Rect x={92} y={56} width={84} height={10} fill="#D4AF37" />
            <Rect x={92} y={56} width={14} height={10} fill="#FC8181" />
            <Rect x={106} y={56} width={3} height={10} fill="#234E52" />
            <Path d="M176 56 L188 61 L176 66 Z" fill="#F6E27F" />
            <Path d="M188 61 L194 61 L188 64 Z" fill="#1A202C" />
          </G>
        </Svg>
      </View>

      <Text style={styles.title}>TaskMate</Text>
      <Text style={styles.tagline}>Stay on top of everything.</Text>

      <ActivityIndicator
        style={styles.loader}
        size="small"
        color={Colors.primary}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.headerBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  illustration: {
    width: 200,
    height: 240,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    color: Colors.textOnDark,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textOnDarkMuted,
    marginTop: 8,
  },
  loader: {
    marginTop: 32,
  },
});
