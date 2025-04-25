import { json, ActionFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action: ActionFunction = async ({ request }) => {
  console.log("==============CALLED============");
  try {
    const payload = await request.json();

    const orderId = payload?.id;
    const orderStatusUrl = payload?.order_status_url;

    if (!orderId || !orderStatusUrl) {
      return json({ error: "Missing order ID or status URL" }, { status: 400 });
    }

    const shopMatch = orderStatusUrl.match(/https:\/\/(.+?)\.myshopify\.com/);
    const shop = shopMatch ? `${shopMatch[1]}.myshopify.com` : null;

    if (!shop) {
      return json({ error: "Unable to extract shop domain" }, { status: 400 });
    }

    // Get access token for the shop
    const session = await prisma.session.findFirst({
      where: { shop },
      select: { accessToken: true },
    });

    if (!session?.accessToken) {
      return json({ error: "Access token not found for shop" }, { status: 404 });
    }

    const accessToken = session.accessToken;
    const gqlQuery = `
      query GetOrderContract($orderId: ID!) {
        order(id: $orderId) {
          id
          lineItems(first: 100) {
            nodes {
              customAttributes {
                key
                value
              }
              contract {
                id
              }
            }
          }
        }
      }
    `;

    const orderGid = `gid://shopify/Order/${orderId}`;

    const graphqlResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: gqlQuery,
        variables: { orderId: orderGid },
      }),
    });

    const result = await graphqlResponse.json();

    const lineItems = result?.data?.order?.lineItems?.nodes || [];

    for (const item of lineItems) {
      const isGift = item.customAttributes?.some(
        (attr: any) => attr.key === "_HiddenNote" && attr.value === "GIFT"
      );

      if (isGift && item.contract?.id) {
        // Pause contract
        const pauseMutation = `
          mutation SubscriptionContractPause($contractId: ID!) {
            subscriptionContractPause(subscriptionContractId: $contractId) {
              contract {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const pauseResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query: pauseMutation,
            variables: {
              contractId: item.contract.id,
            },
          }),
        });

        const pauseResult = await pauseResponse.json();
        const errors = pauseResult?.data?.subscriptionContractPause?.userErrors;

        if (errors?.length) {
          return json({ error: "Pause failed", userErrors: errors }, { status: 400 });
        }
      }
    }

    return json({ success: true });

  } catch (error: any) {
    console.error("Webhook Error:", error);
    return json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
};
