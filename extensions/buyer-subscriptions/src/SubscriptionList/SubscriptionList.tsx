import {
  Grid,
  BlockStack,
  Style,
  SkeletonTextBlock,
  SkeletonImage,
  Card,
  View,
  Page,
} from '@shopify/ui-extensions-react/customer-account';

import {useSubscriptionListData} from './hooks/useSubscriptionListData';
import {SubscriptionListEmptyState, SubscriptionListItem} from './components';
import {useExtensionApi} from 'foundation/Api';
import type {BillingAttemptErrorType} from 'types';
import { useEffect, useState } from 'react';
import axios from 'axios';

export function SubscriptionList() {
  const[customerEmail,setCustomerEmail]=useState("test@gmail.com");
  useEffect(() => {
  console.log("useeffect___call");
    fetchCustomerData();
  }, []);
  
  const getCustomerNameQuery = {
  query: `query {
    customer {
      emailAddress{
      emailAddress
      }
      id
    }
  }`
};
  const fetchCustomerData = async () => {
    console.log("fetchCustomerData");
      try {
        const response = await fetch("shopify://customer-account/api/unstable/graphql.json", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(getCustomerNameQuery),
        });
  
        const { data: { customer } } = await response.json();
        
        const { emailAddress, id } = customer;
        setCustomerEmail(emailAddress.emailAddress)
 
      } catch (error) {
        console.error("Error fetching customer data:", error);
      }
    };
    


  const {i18n} = useExtensionApi();
  const {data, loading, error, refetchSubscriptionListData} =
    useSubscriptionListData();

  if (loading && !data) {
    return <SubscriptionListLoadingState />;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (data?.subscriptionContracts.length === 0) {
    return <SubscriptionListEmptyState />;
  }
  const excludedNames = ["L’immanquable", "L’essentielle", "La gourmande"];

  const filteredContracts = data?.subscriptionContracts?.filter(({ lines }) => {
    const { name } = lines[0];
    const lowerName = name.toLowerCase();

    return !excludedNames.some(word =>
      lowerName.includes(word.toLowerCase())
    );
  }) ?? [];
  
    if (filteredContracts.length === 0) {
      return <SubscriptionListEmptyState />;
    }

    const listItems = filteredContracts.length ? filteredContracts.map(
        ({
          lines,
          id,
          status,
          lastBillingAttemptErrorType,
          upcomingBillingCycles,
          deliveryPolicy,
          updatedAt,
          totalQuantity,
          lastOrderPrice,
          priceBreakdownEstimate,
        }) => {
          const { name, image } = lines[0];

          return (
            <SubscriptionListItem
              key={id}
              customerEmail={customerEmail}
              id={id}
              upcomingBillingCycles={upcomingBillingCycles}
              firstLineName={name}
              lineCount={lines.length}
              totalQuantity={totalQuantity}
              image={image}
              status={status}
              lastBillingAttemptErrorType={
                lastBillingAttemptErrorType as BillingAttemptErrorType | null
              }
              deliveryPolicy={deliveryPolicy}
              updatedAt={updatedAt}
              lastOrderPrice={lastOrderPrice}
              refetchSubscriptionListData={refetchSubscriptionListData}
              totalPrice={priceBreakdownEstimate?.totalPrice}
            />
          );
        },
      )
    : null;

  return (
    <Page title={i18n.translate('subscriptions')}>
      <Grid
        columns={Style.default(['fill'])
          .when({viewportInlineSize: {min: 'small'}}, ['fill', 'fill'])
          .when({viewportInlineSize: {min: 'medium'}}, [
            'fill',
            'fill',
            'fill',
          ])}
        spacing="loose"
        rows="auto"
      >
        {listItems}
      </Grid>
    </Page>
  );
}

export function SubscriptionListLoadingState() {
  const {i18n} = useExtensionApi();

  return (
    <Page title={i18n.translate('subscriptions')} loading>
      <Grid
        columns={Style.default(['fill'])
          .when({viewportInlineSize: {min: 'small'}}, ['fill', 'fill'])
          .when({viewportInlineSize: {min: 'medium'}}, [
            'fill',
            'fill',
            'fill',
          ])}
        spacing="loose"
      >
        <View data-testid="loading-state">
          <Card padding>
            <BlockStack>
              <SkeletonTextBlock lines={2} size="extraLarge" />
              <SkeletonImage inlineSize="fill" blockSize={380} />
              <SkeletonTextBlock lines={3} />
              <SkeletonTextBlock lines={1} emphasis="bold" size="extraLarge" />
            </BlockStack>
          </Card>
        </View>
      </Grid>
    </Page>
  );
}
