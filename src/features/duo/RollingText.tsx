import { Animated, View, type StyleProp, type TextStyle } from 'react-native';
import { useEntrance } from './motion';

/** Text that rolls up into place like a slot machine whenever its value changes. */
export function RollingText({ value, style, reduced }: { value: string; style?: StyleProp<TextStyle>; reduced: boolean }) {
  const v = useEntrance(value, { duration: 320, reduced });
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.Text
        style={[
          style,
          {
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        {value}
      </Animated.Text>
    </View>
  );
}
