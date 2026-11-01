import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { holdLinkHosts } from '@/api';
import { Button, Field, Screen } from '@/components/ui';
import { rentalTokenFrom } from '@/links/rental-link';

// Pasting the link from the shop's email or text. The whole message can be pasted; the link is found in it.
export function AddLinkScreen() {
  const t = useTranslations('addLink');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<'missing' | 'invalid' | undefined>(undefined);

  const open = () => {
    if (text.trim() === '') return setProblem('missing');
    const token = rentalTokenFrom(text, holdLinkHosts());
    if (token === undefined) return setProblem('invalid');
    router.replace(`/r/${token}`);
  };

  return (
    <Screen footer={<Button label={t('submit')} onPress={open} />}>
      <Field
        label={t('field')}
        hint={t('hint')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setProblem(undefined);
        }}
        error={problem === undefined ? undefined : t(problem)}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        onSubmitEditing={open}
        multiline
      />
    </Screen>
  );
}
