import { unauthenticated } from "../shopify.server";
import { json } from "@remix-run/node";



async function fetchAllCustomers(admin) {
  let customers = [];
  let hasNextPage = true;
  let endCursor = null;

  while (hasNextPage) {
    const query = `
      query FetchCustomers($after: String) {
        customers(first: 250, after: $after) {
          edges {
            node {
              id
              email
              displayName
              tags
              metafields(first: 100, namespace: "custom") {
                edges {
                  node {
                    id
                    key
                    value
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = endCursor ? { after: endCursor } : {};
    const response = await admin.graphql(query, { variables });
    const result = await response.json();

    const fetchedCustomers = result.data.customers.edges.map((edge) => {
      const customer = edge.node;
      const metafield = customer.metafields.edges.find(
        (m) => m.node.key === 'subscription_data'
      )?.node;


      let subscriptionOrders = [];
      if (metafield?.value) {
        try {
          subscriptionOrders = JSON.parse(metafield.value);
        } catch (e) {
          subscriptionOrders = [];
        }
      }

      return {
        id: customer.id,
        displayName: customer.displayName,
        email: customer.email,
        tags: customer.tags,
        subscriptionOrders
      };
    });

    customers = customers.concat(fetchedCustomers);

    hasNextPage = result.data.customers.pageInfo.hasNextPage;
    endCursor = result.data.customers.pageInfo.endCursor;
  }

  return customers;
}


async function createOrder(customers , admin) {
  const today = new Date();
  const todayDate = today.getDate(); 
  if(!customers ||customers.length==0){
    return ;
  }
  else{
    for (const customer of customers) {
      const { subscriptionOrders = [] } = customer;
      for (const sub of subscriptionOrders) {
        const billingDay = new Date(sub.nextBillingDate).getDate();
        if (sub.status === "ACTIVE" && billingDay === todayDate) {
          let totalAmount = 0.1;
        const lineItemsToRepeat =
          sub?.lines?.edges?.map((edge: any) => ({
            variantId: edge.node.variantId,
            quantity: 1, 
          })) ?? [];
  
          if (lineItemsToRepeat.length === 0) continue;
  
          const createOrderMutation = `
            mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
              orderCreate(order: $order, options: $options) {
                  userErrors {
                  field
                  message
                  }
                  order {
                  id
                  totalTaxSet {
                      shopMoney {
                      amount
                      currencyCode
                      }
                  }
                  lineItems(first: 5) {
                      nodes {
                      variant {
                          id
                      }
                      id
                      title
                      quantity
                      taxLines {
                          title
                          rate
                          priceSet {
                          shopMoney {
                              amount
                              currencyCode
                          }
                          }
                      }
                      }
                  }
                  }
              }
              }
          `;

           const sanitizedAddress = { ...sub.address };
      delete sanitizedAddress.countryCode;

            const variables = {
        order: {
                customerId: customer.id,
                shippingAddress: sanitizedAddress,
                billingAddress: sanitizedAddress,
                lineItems: lineItemsToRepeat,
                tags: ["subscription_renewal",sub.title],
                 "transactions": [
                  {
                    "kind": "SALE",
                    "status": "SUCCESS",
                    "amountSet": {
                      "shopMoney": {
                        "amount": 0.1,
                        "currencyCode": "EUR"
                      }
                    }
                  }
                ]
              }
            };            
            try {
              const createResp = await admin.graphql(createOrderMutation, {
                variables: variables,
              });

              const createdOrder = await createResp.json();
              console.log("Full response from Shopify:", createdOrder);
              if (createdOrder?.data?.orderCreate?.userErrors?.length > 0) {
                console.error("User errors:", createdOrder.data.orderCreate.userErrors);
              } else {
                console.log("Gift order created:", createdOrder.data.orderCreate.order?.id);
              }

            } catch (err) {
            
              console.error("GraphQL request failed:", err);
            }

          //   console.log("createOrderInput_______",  lineItemsToRepeat[0]);
            

          // const createResp = await admin.graphql(createOrderMutation, {
          //   variables: createOrderInput
          // });
  
          // const createdOrder = await createResp.json();
          // console.log("Gift order created:", createdOrder.data.orderCreate.order?.id);
        }
      }
    }
  }
  
}


export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
     if (!shop) {
    return json({ success: false, message: "Missing shop parameter" }, { status: 400 });
  }
   const { admin , session } = await unauthenticated.admin(shop);

   console.log("session___" ,session);
   

 (async () => {
     try {
       const customers = await fetchAllCustomers(admin);
       await createOrder(customers , admin);
     } catch (err) {
       console.error("Error in background customer fetch:", err);
     }
   })();
 
   return json({ success: true, message: "Processing customers in background" });
 } catch (error:any) {
  console.log('error:-->', error.message , error);
  
   return json({ success: false, message: error.message || 'internal server error' });
 }
};


