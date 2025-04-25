import { json, LoaderFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action: LoaderFunction = async ({ request }) => {
  try {
    const formData = await request.formData();
const shop = formData.get('shop')?.toString();
const email = formData.get('email')?.toString();
const subscriptionContractId = formData.get('subscriptionContractId')?.toString();

    if (!shop || !email || !subscriptionContractId) {
      return json({ error: "Missing shop, email or subscriptionContractId" }, { status: 400 });
    }

    // Fetch access token
    const session = await prisma.session.findFirst({
      where: { shop },
      select: { accessToken: true }
    });

    if (!session?.accessToken) {
      return json({ error: "Access token not found for this shop" }, { status: 404 });
    }

    const accessToken = session.accessToken;

    // Get customer and their subscription contracts by email
    const query = `
      {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              subscriptionContracts(first: 10) {
                nodes {
                  id
                  status
                }
              }
            }
          }
        }
      }
    `;

    const graphqlResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query }),
    });

    const result = await graphqlResponse.json();
    const customerNode = result?.data?.customers?.edges?.[0]?.node;

    if (!customerNode) {
      return json({ error: "No customer found with this email." }, { status: 404 });
    }

    const contracts = customerNode.subscriptionContracts.nodes;

    if (!contracts.length) {
      return json({ message: "No subscriptions found for this email." });
    }

    const fullContractId = `gid://shopify/SubscriptionContract/${subscriptionContractId}`;
    const matchedContract = contracts.find((c: any) => c.id === fullContractId);

    if (!matchedContract) {
      return json({ message: "This subscriptionContractId is not associated with the given email." });
    }

    if (matchedContract.status === "PAUSED") {
      // Activate the paused contract
      const activateMutation = `
        mutation SubscriptionContractActivate($subscriptionContractId: ID!) {
          subscriptionContractActivate(subscriptionContractId: $subscriptionContractId) {
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

      const activateResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: activateMutation,
          variables: {
            subscriptionContractId: fullContractId,
          },
        }),
      });

      const activateResult = await activateResponse.json();
      const userErrors = activateResult.data.subscriptionContractActivate.userErrors;

      if (userErrors?.length) {
        return json({ error: "Activation failed", userErrors }, { status: 400 });
      }

      return json({ success: true, message: "Contract activated.", data: activateResult.data.subscriptionContractActivate });
    }

    return json({ message: "Contract is already active." });

  } catch (err: any) {
    console.error(err);
    return json({ error: "Internal server error", details: err.message }, { status: 500 });
  }
};
