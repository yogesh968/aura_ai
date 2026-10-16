import { useMemo } from 'react';
import { Linking, View } from 'react-native';
import { toast } from '@/lib/toast';
import * as WebBrowser from 'expo-web-browser';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { parseMarkdown, type Inline } from '../markdown';

export function openLink(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => toast.error("Couldn't open this link")));
}

function InlineText({ parts, color }: { parts: Inline[]; color: 'text' | 'primaryText' }) {
  const { colors } = useTheme();
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case 'bold':
            return (
              <Text key={i} variant="body" color={color} weight="700">
                {p.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} variant="body" color={color} style={{ fontStyle: 'italic' }}>
                {p.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} variant="body" color={color} style={{ fontFamily: 'monospace', backgroundColor: colors.surfaceAlt }}>
                {` ${p.text} `}
              </Text>
            );
          case 'link':
            return (
              <Text key={i} variant="body" color={color === 'text' ? 'primary' : color} style={{ textDecorationLine: 'underline' }} accessibilityRole="link" onPress={() => openLink(p.url)}>
                {p.text}
              </Text>
            );
          default:
            return p.text;
        }
      })}
    </>
  );
}

/** Renders the assistant's markdown-lite text. */
export function Markdown({ text, color = 'text' }: { text: string; color?: 'text' | 'primaryText' }) {
  const { colors, radius } = useTheme();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, i) => {
        if (b.type === 'code') {
          return (
            <View key={i} style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10 }}>
              <Text variant="caption" style={{ fontFamily: 'monospace' }} selectable>
                {b.text}
              </Text>
            </View>
          );
        }
        if (b.type === 'bullet') {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 2 }}>
              <Text variant="body" color={color}>
                {b.marker}
              </Text>
              <Text variant="body" color={color} style={{ flex: 1 }}>
                <InlineText parts={b.content} color={color} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} variant={b.type === 'heading' ? 'bodyStrong' : 'body'} color={color}>
            <InlineText parts={b.content} color={color} />
          </Text>
        );
      })}
    </View>
  );
}
