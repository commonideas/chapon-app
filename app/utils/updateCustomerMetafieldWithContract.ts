import { duration } from "happy-dom/lib/PropertySymbol.js";
import { Address } from "~/components/Address/Address";

export async function updateCustomerMetafieldWithContract({
  shop,
  accessToken,
  email,
  firstName,
  lastName,
  phone,
  customer_address,
  contract,
  startDate,
}: {
  shop: string;
  accessToken: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  customer_address?:object;
  contract: {
  id: string;
  nextBillingDate?: string;
  status?: string;
  billingPolicy?: {
    interval?: string;
    intervalCount?: number;
  };
};
  startDate: string;
}): Promise<boolean> {
  try {

    // Step 1: Search for customer by email
    const getCustomerQuery = `
      query getCustomerByEmail($email: String!) {
        customers(first: 1, query: $email) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const customerRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: getCustomerQuery,
        variables: { email },
      }),
    });

    const customerJson = await customerRes.json();
    
    let customerId = customerJson?.data?.customers?.edges?.[0]?.node?.id;
    console.log("customerJson_____" , customerId);


    // Step 2: Create customer if not found
    if (!customerId) {
      const createMutation = `
        mutation createCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: createMutation,
          variables: {  "input": {"email":email, "firstName":firstName, "lastName":lastName , addresses:[customer_address]}}
        }),
      });

      const createData = await createRes.json();
      const createErrors = createData?.data?.customerCreate?.userErrors;

      if (createErrors?.length > 0) {
        throw new Error(`Customer creation failed: ${createErrors[0].message}`);
      }

      customerId = createData?.data?.customerCreate?.customer?.id;

      console.log("customerId____" ,customerId);
      

      if (!customerId) {
        throw new Error("Customer ID was not returned after creation.");
      }
    }

    // Step 3: Get existing metafield value
    const getMetafieldQuery = `
      query getCustomerMetafields($id: ID!) {
        customer(id: $id) {
          metafield(namespace: "custom", key: "subscription_data") {
            id
            value
          }
        }
      }
    `;

    const metafieldRes = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: getMetafieldQuery,
        variables: { id: customerId },
      }),
    });

    const transformedContract = {
      ...contract,
      title:`subscription-${contract.id.split("/").pop()}`,
      nextBillingDate: contract?.nextBillingDate?.split('T')[0], 
      duration:contract?.billingPolicy?.intervalCount,
      address:customer_address,
      count: 0, 
      startDate
    };

    const metafieldJson = await metafieldRes.json();
    const existingValue = metafieldJson?.data?.customer?.metafield?.value;
    let contractArray: any[] = [];

    try {
      if (existingValue) {
        contractArray = JSON.parse(existingValue);
        if (!Array.isArray(contractArray)) contractArray = [];
      }
    } catch (err) {
      console.warn("Failed to parse existing metafield JSON. Reinitializing as empty array.");
      contractArray = [];
    }

    // Step 4: Add new contract data
    contractArray.push({ ...transformedContract, startDate });

    // Step 5: Update metafield
    const updateMutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: {
          input: {
            id: customerId,
            metafields: [
              {
                namespace: "custom",
                key: "subscription_data",
                type: "json",
                value: JSON.stringify(contractArray),
              },
            ],
          },
        },
      }),
    });

    const updateJson = await updateRes.json();
    const updateErrors = updateJson?.data?.customerUpdate?.userErrors;
    if (updateErrors?.length > 0) {
      throw new Error(`Customer metafield update failed: ${updateErrors[0].message}`);
    }
console.log("updateJson____" ,updateJson.data.customerUpdate.customer);
    return true;
  } catch (error: any) {
    console.error("❌ updateCustomerMetafieldWithContract error:", error.message || error);
    throw new Error(`updateCustomerMetafieldWithContract failed: ${error.message || error}`);
  }
}
