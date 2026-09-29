import { StyleSheet, Text, TextProps } from 'react-native';

import { ColorName, colors } from '@/theme';

type Variant = 'title' | 'heading' | 'section' | 'body' | 'label' | 'caption';

type Props = TextProps & {
  variant?: Variant;
  color?: ColorName;
  weight?: '400' | '500' | '600' | '700';
  align?: 'left' | 'center' | 'right';
};

export function AppText({ variant = 'body', color = 'text', weight, align, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[
        styles[variant],
        { color: colors[color] },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  heading: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  section: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
});
