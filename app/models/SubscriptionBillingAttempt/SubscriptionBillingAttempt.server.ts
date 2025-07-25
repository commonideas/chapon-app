import {DateTime} from 'luxon';
import type {
  SubscriptionBillingCycleByIndexQuery as SubscriptionBillingCycleByIndexQueryType,
  SubscriptionBillingCyclesQuery as SubscriptionBillingCyclesQueryType,
  SubscriptionPastBillingCyclesQuery as SubscriptionPastBillingCyclesQueryType,
} from 'types/admin.generated';
import type {
  FailedBillingCycle,
  GraphQLBillingCycle,
  GraphQLClient,
  PastBillingCycle,
  UpcomingBillingCycle,
  InsufficientStockProductVariants,
} from '~/types';
import {logger} from '~/utils/logger.server';

import {nodesFromEdges} from '@shopify/admin-graphql-api-utilities';
import type {SellingPlanInterval} from 'types/admin.types';
import SubscriptionBillingAttemptQuery from '~/graphql/SubscriptionBillingAttemptQuery';
import SubscriptionBillingCycleByIndexQuery from '~/graphql/SubscriptionBillingCycleByIndexQuery';
import SubscriptionBillingCyclesQuery from '~/graphql/SubscriptionBillingCyclesQuery';
import SubscriptionPastBillingCyclesQuery from '~/graphql/SubscriptionPastBillingCyclesQuery';
import {unauthenticated} from '~/shopify.server';
import {advanceDateTime} from '~/utils/helpers/date';

export async function findSubscriptionBillingAttempt(shop: string, id: string) {
  const {admin} = await unauthenticated.admin(shop);

  const response = await admin.graphql(SubscriptionBillingAttemptQuery, {
    variables: {billingAttemptId: id},
  });

  const json = await response.json();
  const subscriptionBillingAttempt = json.data?.subscriptionBillingAttempt;

  if (!subscriptionBillingAttempt) {
    throw new Error(`Failed to find SubscriptionBillingAttempt with id: ${id}`);
  }

  return subscriptionBillingAttempt;
}

export async function getPastBillingCycles(
  graphql: GraphQLClient,
  contractId: string,
  endDate: string,
): Promise<{
  pastBillingCycles: PastBillingCycle[];
  failedBillingCycle?: FailedBillingCycle;
}> {
  const billingCycles = await (async () => {
    try {
      const {
        data: {subscriptionBillingCycle: firstBillingCycle},
      } = (await (
        await graphql(SubscriptionBillingCycleByIndexQuery, {
          variables: {
            contractId,
            billingCycleIndex: 1,
          },
        })
      ).json()) as {data: SubscriptionBillingCycleByIndexQueryType};

      // we need to use the first billing date since using the contract
      // creation date might throw an error because there's a slight
      // delay between when the contract was created and when the first
      // billing cycle starts and we cannot pass in a start time
      // before the first billing cycle starts
      const firstBillingDate = firstBillingCycle?.cycleStartAt;

      if (!firstBillingDate) {
        return null;
      }

      const response = await graphql(SubscriptionPastBillingCyclesQuery, {
        variables: {
          contractId,
          numberOfCycles: 5,
          numberOfAttempts: 10,
          startDate: firstBillingDate,
          endDate,
        },
      });

      const {data} = (await response.json()) as {
        data: SubscriptionPastBillingCyclesQueryType;
      };

      return nodesFromEdges(data.subscriptionBillingCycles.edges);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(
        {contractId},
        `Unable to fetch past billing cycles: ${error.message}`,
      );
      return null;
    }
  })();

  if (!billingCycles) {
    return {
      pastBillingCycles: [],
    };
  }

  const pastBillingCycles = billingCycles.flatMap((billingCycle) => {
    const {
      billingAttempts,
      skipped,
      billingAttemptExpectedDate,
      cycleIndex,
      status,
    } = billingCycle;
    const attempts = nodesFromEdges(billingAttempts.edges);
    const order = attempts.find((attempt) => Boolean(attempt.order))?.order;

    // if a billing cycle has an order created, count it as in the past.
    // even if the expected billing date is in the future
    // this can happen if an order is created and then the contract is edited
    // to change the billing date (ex: changing delivery frequency)
    const isUpcomingBillingCycle =
      !order &&
      ((status === 'UNBILLED' && !skipped) ||
        new Date(billingAttemptExpectedDate) > new Date(endDate));

    if (isUpcomingBillingCycle) {
      return [];
    }

    return [
      {
        cycleIndex,
        skipped,
        billingAttemptExpectedDate,
        order: order ?? undefined,
      },
    ];
  });

  const latestBillingCycle = billingCycles[0];
  const attempts = nodesFromEdges(
    latestBillingCycle?.billingAttempts?.edges || [],
  );

  const failedBillingCycle =
    attempts[0]?.processingError?.code === 'INSUFFICIENT_INVENTORY' &&
    !latestBillingCycle?.skipped
      ? latestBillingCycle
      : undefined;

  return {
    pastBillingCycles,
    failedBillingCycle: failedBillingCycle
      ? {
          ...failedBillingCycle,
          insufficientStockProductVariants:
            getInsufficientStockProductVariants(failedBillingCycle),
        }
      : undefined,
  };
}

function getInsufficientStockProductVariants(
  failedBillingCycle: GraphQLBillingCycle,
): InsufficientStockProductVariants[] {
  const processingError =
    failedBillingCycle?.billingAttempts?.edges[0]?.node?.processingError;

  if (!processingError) {
    return [];
  }

  const productVariantsType =
    'insufficientStockProductVariants' in processingError
      ? nodesFromEdges(processingError.insufficientStockProductVariants.edges)
      : [];

  return productVariantsType.map((variant) => {
    const image =
      variant.image ?? variant.product.featuredMedia?.preview?.image;

    return {
      ...variant,
      image: image
        ? {
            originalSrc: image.url,
            altText: image.altText ?? undefined,
          }
        : null,
    };
  });
}

export async function getNextBillingCycleDates(
  graphql: GraphQLClient,
  contractId: string,
  billingCyclesCount: number,
  interval: SellingPlanInterval,
  intervalCount: number,
  maxCycles:number,
): Promise<{
  upcomingBillingCycles: UpcomingBillingCycle[];
  hasMoreBillingCycles: boolean;
}> {
  const startDate = new Date().toISOString();

  const advancedDate = advanceDateTime(
    DateTime.now(),
    interval,
    intervalCount,
    billingCyclesCount,
  );

  // Luxon doesn't guarantee `toISO()` will return a string if DateTime is invalid
  // so we default to one year from now
  // `!` at the end because we know DateTime.now() is valid so `toISO()` is too
  const endDate =
    advancedDate.toISO() ?? DateTime.now().plus({year: 1}).toISO()!;

  const response = await graphql(SubscriptionBillingCyclesQuery, {
    variables: {
      contractId,
      first: billingCyclesCount,
      startDate,
      endDate,
    },
  });
  const {data} = (await response.json()) as {
    data: SubscriptionBillingCyclesQueryType;
  };

  if (data === null) {
    throw new Error(
      `Failed to find SubscriptionBillingCycles with contractId: ${contractId}, first: ${billingCyclesCount}, startDate: ${startDate}, endDate: ${endDate}`,
    );
  }


 
  // Filter out cycles where there is already an order
  let filteredBillingCycles = nodesFromEdges(data.subscriptionBillingCycles.edges).filter(
    ({ billingAttempts }) => {
      const attempts = nodesFromEdges(billingAttempts.edges || []);
      return !attempts.some((attempt) => Boolean(attempt.order));
    }
  );

  // Logic for maxCycles
  if (maxCycles === null || maxCycles !== 1) {
    // If maxCycles is null or maxCycles is not 1, return the original filtered billing cycles
    return {
      upcomingBillingCycles: filteredBillingCycles,
      hasMoreBillingCycles: data.subscriptionBillingCycles.pageInfo.hasNextPage,
    };
  }


  
  if (maxCycles === 1) {
     const lastCycle = filteredBillingCycles[0];

    if (!lastCycle) {
      return {
        upcomingBillingCycles: [],
        hasMoreBillingCycles: data.subscriptionBillingCycles.pageInfo.hasNextPage,
      };
    }

    // Start from the last cycle's billing date (before billingAttemptExpectedDate)
    let currentBillingDate = DateTime.fromISO(lastCycle.billingAttemptExpectedDate).minus({ months: intervalCount });
    console.log("currentBillingDate____", currentBillingDate.toISO());

    const customCycles = [];

    // Include the first cycle as the current cycle (it should be included, even if in the past)
    customCycles.push({
      ...lastCycle,
      billingAttemptExpectedDate: currentBillingDate.toISO(),
      cycleIndex: 1, // Custom cycle index (1)
    });

    // Generate cycles for intervalCount months (e.g., 3 months if intervalCount is 3)
    for (let i = 1; i < intervalCount; i++) {
      // Move to the next cycle by adding 1 month
      currentBillingDate = currentBillingDate.plus({ months: 1 });

      // If the generated cycle is in the past, skip it
      if (currentBillingDate < DateTime.now()) {
        console.log(`Skipping past date: ${currentBillingDate.toISO()}`);
        continue;
      }

      customCycles.push({
        ...lastCycle,
        billingAttemptExpectedDate: currentBillingDate.toISO(),
        cycleIndex: i + 1, // Custom cycle index (2, 3, ...)
      });
    }

    // Now ensure we only return cycles that are **not** in the past
    const validUpcomingCycles = customCycles.filter((cycle) => DateTime.fromISO(cycle.billingAttemptExpectedDate) >= DateTime.now());

    return {
      upcomingBillingCycles: validUpcomingCycles,
      hasMoreBillingCycles: data.subscriptionBillingCycles.pageInfo.hasNextPage,
    };
  }

  return {
    upcomingBillingCycles: [],
    hasMoreBillingCycles: data.subscriptionBillingCycles.pageInfo.hasNextPage,
  };
}