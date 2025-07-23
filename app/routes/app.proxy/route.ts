import { json, LoaderFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { updateCustomerMetafieldWithContract } from '~/utils/updateCustomerMetafieldWithContract';


const prisma = new PrismaClient();

export const action: LoaderFunction = async ({ request }) => {
  try {
    const formData = await request.formData();
    const shop = formData.get('shop')?.toString();
    const email = formData.get('activation_email')?.toString();
    const draftsubscriptionContractId = formData.get('subscriptionContractId')?.toString();
      const firstName = formData.get('firstName')?.toString();
      const lastName = formData.get('lastName')?.toString();
      const address1 = formData.get('address1')?.toString();
      const province = formData.get('province')?.toString();
      const zip = formData.get('zip')?.toString();
      const country = formData.get('country')?.toString();
      const phone = formData.get('phone')?.toString();
      // const startDate:any = formData.get('next-billing-date')?.toString();
      const startDate = new Date();
          /// Parse and validate start date
        const parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          return json({ error: "Invalid start date format" }, { status: 400 });
        }
        if (!email) {
          return json({error: 'Missing customer email'}, {status: 400});
        }

        // Compare dates without time component
        const today = new Date();
        const startDateOnly = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth(), parsedStartDate.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // Allow current date or future dates
        // if (startDateOnly < todayOnly) {
        //   return json({ error: "Start date must be today or in the future" }, { status: 400 });
        // }

        // Format startDate for Shopify (midnight UTC on the chosen date)
        const formattedStartDate = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth(), parsedStartDate.getDate()).toISOString();

        console.log("Parsed Start Date:", parsedStartDate, "Formatted Start Date:", formattedStartDate, "Current Date:", new Date());

    if (!shop || !draftsubscriptionContractId) {
      return json({ error: "Missing shop or subscriptionContractId" }, { status: 400 });
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

    const fullContractId = `gid://shopify/SubscriptionDraft/${draftsubscriptionContractId}`;
    console.log("draftsubscriptionContractId____",draftsubscriptionContractId);
    // console.log("tokennnn--- " , session);
    
    // return draftsubscriptionContractId;

        const updateMutation = `
        mutation subscriptionDraftUpdate($draftId: ID!, $input: SubscriptionDraftInput!) {
          subscriptionDraftUpdate(draftId: $draftId, input: $input) {
            draft {
              id
              nextBillingDate
              deliveryMethod {
                __typename
                ... on SubscriptionDeliveryMethodShipping {
                  address {
                    address1
                    city
                    zip
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const updateResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: updateMutation,
          variables: {
            draftId: fullContractId,  // Or dynamically from your data
            input: {
              deliveryMethod: {
                shipping: {
                  address: {
                    address1: address1,
                    city: province,
                    province: province,
                    country: country,
                    zip: zip,
                    firstName: firstName,
                    lastName: lastName,
                    phone: phone
                  }
                }
              },
              nextBillingDate: parsedStartDate,
            }
          }
        })
      });

      const responseData = await updateResponse.json();

      if (responseData.errors) {
        console.error("GraphQL Errors:", responseData);
        return json({ error: "GraphQL Errors:" }, { status: 400 });
      }

      const userErrors = responseData?.data?.subscriptionDraftUpdate?.userErrors;
      if (userErrors.length > 0) {
        console.warn("User Errors:", userErrors?.[0]?.message);
        return json({ error: userErrors?.[0]?.message }, { status: 400 });
      } else {
        
        const commitMutation = `
            mutation subscriptionDraftCommit($draftId: ID!) {
              subscriptionDraftCommit(draftId: $draftId) {
                contract {
                  id
                  status
                  nextBillingDate
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const commitResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              query: commitMutation,
              variables: {
                draftId: fullContractId, // Use dynamic ID if needed
              },
            }),
          });

          const commitResponseData = await commitResponse.json();
          const commitResponseErrors = commitResponseData?.data?.subscriptionDraftCommit?.userErrors;
          if (commitResponseErrors.length > 0) {
            console.warn("User Errors:", commitResponseErrors?.[0]?.message);
            return json({ error: commitResponseErrors?.[0]?.message }, { status: 400 });
          }
          else {
            const rawId = commitResponseData?.data?.subscriptionDraftCommit?.contract?.id;
            const activate = `
                  mutation subscriptionContractActivate($contractId: ID!) {
                    subscriptionContractActivate(subscriptionContractId: $contractId) {
                      contract {
                        id
                        status
                        nextBillingDate
                        lines(first: 50) {
                          edges {
                            node {
                              id
                              title
                              variantTitle
                              variantId
                               variantImage {
                                  altText
                                  url
                                }
                              }
                            }
                          }
                          billingPolicy {
                          interval
                          intervalCount
                        }
                      }
                      userErrors {
                        field
                        message
                      }
                    }
                  }
              `;

              const updateResponse = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": accessToken,
                },
                body: JSON.stringify({
                  query: activate, // you're using it here as the update mutation
                  variables: {
                    contractId: rawId, // dynamically pass this if needed
                  },
                }),
              });

              const updateData = await updateResponse.json();

              if (updateData.errors || updateData.data?.subscriptionContractUpdate?.userErrors?.length > 0) {
                console.error("Failed to update subscription contract:", updateData);
                return json({ error: updateData?.[0]?.message }, { status: 400 });
              }
              else{
                let customer_address = {
                  address1: address1,
                  city: province,
                  province: province,
                  phone: phone,
                  zip: zip,
                  lastName: lastName,
                  firstName: firstName,
                  countryCode: country,
                };
                  await updateCustomerMetafieldWithContract({
                    shop,
                    accessToken,
                    email: email,
                    firstName,
                    lastName,
                    phone,
                    customer_address,
                    contract: updateData?.data?.subscriptionContractActivate?.contract,
                    startDate: parsedStartDate.toISOString().split("T")[0],
                  });
                console.log(updateData);
               return json({ message: "Contract Succesfully actived." });
           }
           
          }
      }

  } catch (err: any) {
    console.error(err);
    return json({ error: "Internal server error", details: err.message }, { status: 500 });
  }
};


