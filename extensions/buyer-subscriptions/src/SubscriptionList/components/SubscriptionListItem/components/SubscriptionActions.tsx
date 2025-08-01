import {
  Button,
  View,
  Text,
} from '@shopify/ui-extensions-react/customer-account';
import {
  PauseSubscriptionModal,
  SkipNextOrderModal,
  ResumeSubscriptionModal,
} from 'components';
import {useExtensionApi} from 'foundation/Api';
import type {Money, SubscriptionStatus} from 'types';
import {parseGid} from '@shopify/admin-graphql-api-utilities';
import {SuccessToastType, useToast} from 'utilities/hooks/useToast';

export interface SubscriptionActionsProps {
  id: string;
  customerEmail: string;
  status: SubscriptionStatus;
  hasInventoryError: boolean;
  resumeDate?: string | null;
  resumeDateIfNextCycleSkipped?: string | null;
  cycleIndexToSkip?: number | null;
  lastOrderPrice?: Money | null;
  nextOrderPrice?: Money | null;
  refetchSubscriptionListData: () => void;
}

export const SUBSCRIPTION_ACTIONS_POPOVER_ID = 'subscription-actions-popover';

export function SubscriptionActions({
  id,
  customerEmail,
  status,
  hasInventoryError,
  resumeDate,
  resumeDateIfNextCycleSkipped,
  cycleIndexToSkip,
  lastOrderPrice,
  nextOrderPrice,
  refetchSubscriptionListData,
}: SubscriptionActionsProps) {
  const {
    i18n,
    ui: {overlay},
  } = useExtensionApi();

  const {showSuccessToast} = useToast();

  const subscriptionDetailsUrl = `extension:/subscriptions/${parseGid(id)}`;

  if (!['ACTIVE', 'PAUSED'].includes(status) && !hasInventoryError) {
    return (
      <Button
        kind="secondary"
        appearance="monochrome"
        to={subscriptionDetailsUrl}
      >
        <Text>
          {i18n.translate('subscriptionActions.viewSubscriptionDetails')}
        </Text>
      </Button>
    );
  }

  function onSkipOrder() {
    showSuccessToast(SuccessToastType.Skipped);
    overlay.close(SUBSCRIPTION_ACTIONS_POPOVER_ID);
    refetchSubscriptionListData();
  }

  function onPauseSubscription() {
    showSuccessToast(SuccessToastType.Paused);
    refetchSubscriptionListData();
    overlay.close(SUBSCRIPTION_ACTIONS_POPOVER_ID);
  }

  function onResumeSubscription() {
    showSuccessToast(SuccessToastType.Resumed);
    refetchSubscriptionListData();
    overlay.close(SUBSCRIPTION_ACTIONS_POPOVER_ID);
  }

  function skipButton() {
    return cycleIndexToSkip && resumeDateIfNextCycleSkipped ? (
      <Button
        overlay={
          <SkipNextOrderModal
            contractId={id}
            onSkipOrder={onSkipOrder}
            resumeDate={resumeDateIfNextCycleSkipped}
            cycleIndexToSkip={cycleIndexToSkip}
          />
        }
      >
        <View blockAlignment="center" padding="base">
          <Text>{i18n.translate('subscriptionActions.skip')}</Text>
        </View>
      </Button>
    ) : null;
  }

  return (
    <>
      {/* PrimaryAction - View Subscription Details  */}
      <Button
        kind="secondary"
        appearance="monochrome"
        to={subscriptionDetailsUrl}
      >
        <View blockAlignment="center" padding="base">
          <Text>
            {i18n.translate('subscriptionActions.viewSubscriptionDetails')}
          </Text>
        </View>
      </Button>
      {/* SecondaryAction Grouping */}
      {status === 'ACTIVE' ? (
        <>
          {skipButton()}
          <Button
            overlay={
              <PauseSubscriptionModal
                contractId={id}
                customerEmail={customerEmail}
                onPauseSubscription={onPauseSubscription}
              />
            }
          >
            <View blockAlignment="center" padding="base">
              <Text>{i18n.translate('subscriptionActions.pause')}</Text>
            </View>
          </Button>
        </>
      ) : null}
      {status === 'PAUSED' ? (
        <Button
          overlay={
            <ResumeSubscriptionModal
              contractId={id}
              resumeDate={resumeDate}
              lastOrderPrice={lastOrderPrice}
              nextOrderPrice={nextOrderPrice}
              onResumeSubscription={onResumeSubscription}
            />
          }
        >
          <View blockAlignment="center" padding="base">
            <Text>{i18n.translate('subscriptionActions.resume')}</Text>
          </View>
        </Button>
      ) : null}
      {hasInventoryError ? <>{skipButton()}</> : null}
    </>
  );
}
