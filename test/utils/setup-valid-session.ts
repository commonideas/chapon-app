import {Session} from '@shopify/shopify-api';
import type {SessionStorage} from '@shopify/shopify-app-session-storage';
import {SCOPE, TEST_SHOP, USER_ID} from '../constants';

export async function setUpValidSession(
  sessionStorage: SessionStorage,
  isOnline = false,
): Promise<Session> {
  const overrides: Partial<Session> = {};
  let id = `offline_${TEST_SHOP}`;
  if (isOnline) {
    id = `${TEST_SHOP}_${USER_ID}`;
    // Expires one day from now
    overrides.expires = new Date(Date.now() + 1000 * 3600 * 24);
    overrides.onlineAccessInfo = {
      associated_user_scope: SCOPE,
      expires_in: 3600 * 24,
      associated_user: {
        id: USER_ID,
        account_owner: true,
        collaborator: true,
        email: 'test@test.test',
        email_verified: true,
        first_name: 'Test',
        last_name: 'User',
        locale: 'en-US',
      },
    };
  }

  const session = new Session({
    id,
    shop: TEST_SHOP,
    isOnline,
    state: 'test',
    accessToken: 'totally_real_token',
    scope: SCOPE,
    ...overrides,
  }) as any;
  await sessionStorage.storeSession(session);

  return session;
}
