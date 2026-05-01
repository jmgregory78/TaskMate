import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function DeleteRowButton({ label, onPress, disabled }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View style={styles.row}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
            stroke="#E53E3E"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M10 11v6M14 11v6"
            stroke="#E53E3E"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.label}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#E53E3E',
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#E53E3E',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
});
