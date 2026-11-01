import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { amountText } from '@hold/mobile-api';
import { Button, ChoiceList, Field, Panel, Text } from '@/components/ui';
import { ActionFailure, CODE_LENGTH, OneTimeCode, type ActionFailed, useFailureWords, useRenterAction } from '@/features/renter-common';
import { AdvocateFields, type AdvocateChoice } from '@/features/renter-negotiation/advocate-fields';
import { useClaimWording } from './claim-wording';
import type { RenterClaim } from './claim-screen';

type Decision = 'accept' | 'contest' | 'advocate';

const COMMENT_LIMIT = 1000;

// The renter's answer, after a person approved the claim: acknowledge it first where the shop asks, then accept,
// contest with their reasons, or hand the contest to an advocate. Each needs the code emailed to them, so the link alone
// cannot decide for them, and nothing here names an amount the server trusts but the advocate's highest total.
export function ClaimReply({ token, claim, refresh }: { token: string; claim: RenterClaim; refresh: () => void }) {
  if (claim.canAcknowledge) return <Acknowledge token={token} refresh={refresh} />;
  if (!claim.canReply) return null;
  return <Reply token={token} claim={claim} refresh={refresh} />;
}

function Acknowledge({ token, refresh }: { token: string; refresh: () => void }) {
  const t = useTranslations('claim');
  const acknowledge = useRenterAction(token, 'acknowledge-claim');
  const wording = useClaimWording();
  const reviewed = async () => {
    if ((await acknowledge.run({}))?.ok) refresh();
  };
  return (
    <View className="gap-3">
      <Text>{t('reviewFirst')}</Text>
      <Button label={t('acknowledge')} onPress={() => void reviewed()} loading={acknowledge.pending} />
      <ActionFailure failed={acknowledge.failed} wording={wording} />
    </View>
  );
}

function Reply({ token, claim, refresh }: { token: string; claim: RenterClaim; refresh: () => void }) {
  const t = useTranslations('claim');
  const advocateWords = useTranslations('negotiation');
  const wording = useClaimWording();
  const words = useFailureWords(wording);
  const accept = useRenterAction(token, 'accept-claim');
  const contest = useRenterAction(token, 'contest-claim');
  const advocate = useRenterAction(token, 'start-advocate');
  const [decision, setDecision] = useState<Decision>('accept');
  const [code, setCode] = useState('');
  const [comment, setComment] = useState('');
  const [who, setWho] = useState<AdvocateChoice>('hold');
  const [highest, setHighest] = useState('');
  const [checked, setChecked] = useState(false);
  const running = accept.pending || contest.pending || advocate.pending;
  const failed: ActionFailed | undefined = { accept: accept.failed, contest: contest.failed, advocate: advocate.failed }[decision];
  const codeProblem = failed?.failure === 'refused' && (failed.reason === 'wrong_code' || failed.reason === 'code_expired') ? words(failed) : undefined;
  const reasonMissing = checked && decision === 'contest' && comment.trim() === '';
  const amountInvalid = checked && decision === 'advocate' && !amountText.safeParse(highest).success;
  const note = comment.trim() === '' ? {} : { comment: comment.trim() };

  const submit = async () => {
    setChecked(true);
    if (decision === 'contest' && comment.trim() === '') return;
    if (decision === 'advocate' && !amountText.safeParse(highest).success) return;
    if (decision === 'advocate') {
      const answer = await advocate.run({ code, highest: highest.trim(), ...note, ...(claim.assistantName === null ? {} : { advocate: who }) });
      if (answer?.ok && answer.value.kind === 'negotiation') router.push(`/r/${token}/negotiation`);
      else if (answer?.ok) refresh();
      return;
    }
    const answer = await (decision === 'accept' ? accept : contest).run({ code, ...note });
    if (answer?.ok) refresh();
  };

  const choices: { value: Decision; label: string }[] = [
    { value: 'accept', label: t('accept') },
    { value: 'contest', label: t('contestAction') },
    ...(claim.canAdvocate ? [{ value: 'advocate' as const, label: advocateWords('advocate.title') }] : []),
  ];
  const button = { accept: t('accept'), contest: t('contestAction'), advocate: advocateWords('advocate.start') }[decision];

  return (
    <Panel title={t('yourReply')}>
      <View className="gap-5 p-4">
        {claim.promise !== null && claim.state === 'presented' ? (
          <View className="gap-1 border border-border-strong bg-background p-3">
            <Text variant="label" tone="muted">
              {t('promise.beforeLabel')}
            </Text>
            <Text>{t('promise.beforeBody', { shop: claim.shopName, days: claim.promise.days })}</Text>
          </View>
        ) : null}
        <ChoiceList<Decision> label={t('choose')} value={decision} onChange={setDecision} choices={choices} />
        <OneTimeCode token={token} send="send-claim-code" lead={t('codeGuidance')} code={code} onCodeChange={setCode} error={codeProblem} />
        {decision === 'advocate' ? (
          <AdvocateFields
            currency={claim.currency}
            assistantName={claim.assistantName}
            advocate={who}
            onAdvocateChange={setWho}
            highest={highest}
            onHighestChange={setHighest}
            highestError={amountInvalid ? advocateWords('results.amount_invalid') : undefined}
          />
        ) : null}
        <Field
          label={decision === 'advocate' ? advocateWords('advocate.comment') : t('comment')}
          hint={decision === 'advocate' ? undefined : t('commentHint')}
          error={reasonMissing ? t('results.reason_required') : undefined}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={COMMENT_LIMIT}
          textAlignVertical="top"
        />
        <Button label={button} variant={decision === 'accept' ? 'primary' : 'secondary'} onPress={() => void submit()} loading={running} disabled={code.length < CODE_LENGTH} />
        {codeProblem === undefined ? <ActionFailure failed={failed} wording={wording} /> : null}
      </View>
    </Panel>
  );
}
