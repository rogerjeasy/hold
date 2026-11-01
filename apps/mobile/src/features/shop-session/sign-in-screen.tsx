import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button, CodeInput, Field, Notice, Screen, Text } from '@/components/ui';
import { DemoPanel } from './demo-panel';
import { CODE_LENGTH, useSignIn, type SignInProblem } from './use-sign-in';

// Signing in at the counter: the work email, then the code Hold emails, or one tap into the judges' demo. Owners sign
// up and staff accept invitations on the web; this only signs in.
export function SignInScreen() {
  const t = useTranslations('shop.signIn');
  const signIn = useSignIn();
  return (
    <Screen>
      {signIn.step.name === 'email' ? <EmailStep signIn={signIn} /> : <CodeStep signIn={signIn} email={signIn.step.email} resent={signIn.step.resent} />}
      {signIn.step.name === 'email' ? (
        <>
          <DemoPanel />
          <View className="gap-1">
            <Text tone="muted">{t('renting')}</Text>
            <Button variant="secondary" label={t('rentingAction')} icon="rental" onPress={() => router.replace('/rentals')} className="self-start" />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

type SignIn = ReturnType<typeof useSignIn>;

function useProblemText() {
  const t = useTranslations();
  return (problem: SignInProblem | undefined): string | undefined => (problem === undefined || typeof problem === 'object' ? undefined : t(`shop.signIn.problems.${problem}`));
}

// A failure before Hold answered is not about what was typed: it is shown beside the form, not under a field.
function FailureNotice({ problem }: { problem: SignInProblem | undefined }) {
  const t = useTranslations('loadState');
  if (problem === undefined || typeof problem !== 'object') return null;
  return <Notice tone="warning" announced title={t(`${problem.failure}.title`)} body={t(`${problem.failure}.body`)} />;
}

function EmailStep({ signIn }: { signIn: SignIn }) {
  const t = useTranslations('shop.signIn');
  const text = useProblemText();
  const [email, setEmail] = useState('');
  const send = () => void signIn.sendCode(email);
  return (
    <View className="gap-4">
      <Text tone="muted">{t('lead')}</Text>
      <Field
        label={t('email')}
        value={email}
        onChangeText={setEmail}
        error={text(signIn.problem)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={send}
      />
      <FailureNotice problem={signIn.problem} />
      <Button label={signIn.busy ? t('sending') : t('submit')} icon="mail" onPress={send} loading={signIn.busy} />
    </View>
  );
}

function CodeStep({ signIn, email, resent }: { signIn: SignIn; email: string; resent: boolean }) {
  const t = useTranslations('shop.signIn');
  const text = useProblemText();
  const [code, setCode] = useState('');
  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text variant="title" role="heading">
          {t('codeTitle')}
        </Text>
        <Text tone="muted">{t('codeLead', { email })}</Text>
      </View>
      {resent ? <Notice tone="success" announced title={t('resend')} body={t('resent')} /> : null}
      <CodeInput length={CODE_LENGTH} value={code} onChange={setCode} error={text(signIn.problem)} autoFocus />
      <FailureNotice problem={signIn.problem} />
      <Button label={signIn.busy ? t('checking') : t('verify')} onPress={() => void signIn.verify(code)} loading={signIn.busy} />
      <View className="flex-row flex-wrap gap-3">
        <Button variant="secondary" label={t('resend')} icon="retake" onPress={() => void signIn.sendCode(email, true)} disabled={signIn.busy} />
        <Button variant="secondary" label={t('startOver')} onPress={signIn.startOver} disabled={signIn.busy} />
      </View>
    </View>
  );
}
