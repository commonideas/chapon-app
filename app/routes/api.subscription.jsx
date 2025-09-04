import {unauthenticated} from "../shopify.server"


export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  try {
    const url = new URL(request.url);
    const subscriptionId = url.searchParams.get('subscriptionId');
    const customerId = url.searchParams.get('customerId');
    const shop = url.searchParams.get('shop');
    const type = url.searchParams.get('type');

    if (!subscriptionId || !customerId || !shop || !type) {
      return new Response(JSON.stringify({ error: "Missing required query parameters" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { admin } = await unauthenticated.admin(shop);

    const metafieldResponse = await admin.graphql(
      `#graphql
      query CustomerMetafield($ownerId: ID!) {
        customer(id: $ownerId) {
          metafield(namespace: "custom", key: "subscription_data") {
            id
            value
            namespace
            key
            type
          }
        }
      }`,
      { variables: { ownerId: customerId } }
    );

    const data = await metafieldResponse.json();
    const metafield = data?.data?.customer?.metafield;

    if (!metafield || !metafield.value) {
      return new Response(JSON.stringify({ error: "Metafield not found for customer" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const metafieldID = metafield.id;
    let parsedValue = JSON.parse(metafield.value);

    // Match string ids
    const targetIndex = parsedValue.findIndex(sub => String(sub.id) === String(subscriptionId));
    console.log("targetIndex___", targetIndex);

    if (targetIndex === -1) {
      console.log("Looking for:", subscriptionId);
      console.log("Available subs:", parsedValue.map(s => s.id));
      return new Response(JSON.stringify({ error: "Subscription ID not found in metafield" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Modify or remove subscription
    if (type === "cancel") {
      parsedValue.splice(targetIndex, 1);
    } else {
      parsedValue[targetIndex].status = type.toUpperCase();
    }

    const updateResponse = await admin.graphql(
      `#graphql
      mutation updateCustomerMetafields($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            metafield(namespace: "custom", key: "subscription_data") {
              id
              value
              namespace
              key
              type
            }
          }
          userErrors {
            message
            field
          }
        }
      }`,
      {
        variables: {
          input: {
            id: customerId,
            metafields: [
              {
                id: metafieldID,
                value: JSON.stringify(parsedValue),
                type: metafield.type // include this!
              },
            ],
          },
        },
      }
    );

    const updateResult = await updateResponse.json();
    console.log("updateResult____", updateResult);

    const userErrors = updateResult?.data?.customerUpdate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return new Response(JSON.stringify({ error: "Shopify API returned errors", details: userErrors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updatedMetafield = updateResult?.data?.customerUpdate?.customer?.metafield;
    const updatedValue = updatedMetafield ? JSON.parse(updatedMetafield.value) : null;

    return new Response(JSON.stringify({
      updatedValue,
      message: "Subscription updated successfully",
      success: true,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({
      error: "Internal Server Error",
      message: err?.message || err
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }
};

