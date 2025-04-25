import type {ActionFunctionArgs} from '@remix-run/node';
import {authenticate} from '~/shopify.server';
import {logger} from '~/utils/logger.server';
import {DisableShopJob, jobs} from '~/jobs';

export const action = async ({request}: ActionFunctionArgs) => {
  const {topic, shop, payload} = await authenticate.webhook(request);

  if (topic === 'APP_UNINSTALLED') {
    jobs.enqueue(new DisableShopJob({shop, payload: {}}));
  } else {
    logger.info(
      {topic, shop, payload},
      'Received webhook from CLI. To trigger a specific route, use the --address flag',
    );
  }

  return new Response();
};
