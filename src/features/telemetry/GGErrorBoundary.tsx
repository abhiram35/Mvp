import { Ionicons } from '@expo/vector-icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fontSize, spacing, useTheme, type AppTheme } from '../../theme';
import { reportError } from './reportError';

/**
 * Plain colours used ONLY by this fallback, and ONLY when the theme context itself is missing or
 * broken (e.g. the boundary is mounted above ThemeProvider, or the provider crashed). Every
 * other screen must use theme tokens. Dark neutral so it reads on any device.
 */
const SAFE_COLORS = {
  bg: '#111A22',
  text: '#EEE9E0',
  textMuted: '#B8BEC6',
  primary: '#D63A2F',
  onPrimary: '#FFFFFF',
} as const;

/** Never throws: returns null when there is no usable theme. The hook is always called exactly once. */
function useThemeOrNull(): AppTheme | null {
  try {
    return useTheme();
  } catch {
    return null;
  }
}

function Fallback({ onRetry }: { onRetry: () => void }) {
  const t = useThemeOrNull();
  const c = t
    ? { bg: t.colors.bg, text: t.colors.text, textMuted: t.colors.textMuted, primary: t.colors.primary, onPrimary: t.colors.onPrimary }
    : SAFE_COLORS;
  const heading = t ? t.fonts.heading : undefined;
  const body = t ? t.fonts.body : undefined;
  const caps = t ? t.shape.headingUppercase : false;
  const letterSpacing = t ? t.shape.headingLetterSpacing : 0;
  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
      accessibilityRole="alert"
    >
      <Ionicons name="warning-outline" size={44} color={c.textMuted} />
      <Text
        accessibilityRole="header"
        style={{
          color: c.text,
          fontFamily: heading,
          fontSize: fontSize.xl,
          letterSpacing,
          textTransform: caps ? 'uppercase' : 'none',
          textAlign: 'center',
          marginTop: spacing.md,
        }}
      >
        Something broke on this screen.
      </Text>
      <Text style={{ color: c.textMuted, fontFamily: body, fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm }}>
        {"We've logged it. Try again, or restart the app if it keeps happening."}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={({ pressed }) => ({
          marginTop: spacing.xl,
          minHeight: 50,
          paddingHorizontal: spacing.xl,
          justifyContent: 'center',
          backgroundColor: c.primary,
          opacity: pressed ? 0.85 : 1,
          borderRadius: t ? t.radius.md : 4,
        })}
      >
        <Text style={{ color: c.onPrimary, fontFamily: heading, fontSize: 19, letterSpacing, textTransform: caps ? 'uppercase' : 'none' }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

interface Props {
  children: ReactNode;
  /** Optional label sent with the report (e.g. 'root', 'chat'). */
  name?: string;
}
interface State {
  hasError: boolean;
}

/**
 * Catches render errors below it, reports them (isFatal: false) and shows a themed full-screen
 * fallback with a "Try again" button that resets the boundary.
 */
export class GGErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      isFatal: false,
      context: { source: 'error_boundary', boundary: this.props.name ?? 'root', componentStack: (info.componentStack ?? '').slice(0, 1500) },
    });
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return <Fallback onRetry={this.reset} />;
    return this.props.children;
  }
}
