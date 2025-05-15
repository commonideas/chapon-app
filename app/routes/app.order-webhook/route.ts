import { json, ActionFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import nodemailer from 'nodemailer';

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
          email
          customer {
            email
            firstName
            lastName
          }
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
    const orderEmail = result?.data?.order?.email || result?.data?.order?.customer?.email;
  console.log("Order mail",orderEmail)
    for (const item of lineItems) {
      const isGift = item.customAttributes?.some(
        (attr: any) => attr.key === "_HiddenNote" && attr.value === "GIFT"
      );

      if (isGift && item.contract?.id) {

        const fullGid = item.contract.id;
        const match = fullGid.match(/\/(\d+)$/);
        const contract_id = match ? match[1] : null; 
        // Hardcode the email transporter configuration (for testing purposes)
            const transporter = nodemailer.createTransport({
              host: 'ssl0.ovh.net', // Example: Gmail SMTP
              port: 465, // TLS port (587)
              secure: true, // Set to true for SSL (465), false for TLS (587)
              auth: {
                user: 'test@common-ideas.com', // Your email address
                pass: 'Puu169uKhMepZDNb',  // Your email password (or app-specific password)
              },
            });
            // Send a test email
            try {
              let info = await transporter.sendMail({
                from: 'test@common-ideas.com',
                to: orderEmail,
                subject: 'Gift Product Activation ID',
                text: 'This is a test email sent directly from your Shopify app using SMTP! This is Ashok ka detials ',
                html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
                  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
                    <h2 style="color: #007BFF;">🎁 Activate Your Gift Subscription</h2>
                    <p>Hello,</p>
                    <p>Thank you for receiving a gift subscription!</p>
                    <p>To activate your subscription, please copy the Activation ID below and enter it in the activation form provided:</p>
                    
                    <p style="font-size: 18px; color: #2c3e50; background-color: #f1f1f1; padding: 12px 16px; border-radius: 6px; text-align: center; font-weight: bold;">
                      ${contract_id}
                    </p>

                    <p>If you need assistance, feel free to contact us at <a href="mailto:support@common-ideas.com">support@common-ideas.com</a>.</p>

                    <hr style="margin-top: 30px; border: none; border-top: 1px solid #e0e0e0;">
                    <p style="font-size: 12px; color: #888;">This email was sent from the Common Ideas Shopify App.</p>
                  </div>
                </div>`,
              });

              console.log('Email sent successfully!');
              console.log('Message ID:', info.messageId);
            } catch (error) {
              console.error('Error sending email:', error);
            }


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
