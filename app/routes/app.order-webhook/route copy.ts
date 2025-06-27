import { json, ActionFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import nodemailer from 'nodemailer';
import axios from 'axios';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Buffer } from 'buffer'; 
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
          note
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
    
    const note = result?.data?.order?.note;
    console.log("Nom:", note);
  
    console.log(JSON.stringify(result, null, 2));

    const lineItems = result?.data?.order?.lineItems?.nodes || [];
    const orderEmail = result?.data?.order?.email || result?.data?.order?.customer?.email;
    console.log("Order mail",lineItems)
    
    for (const item of lineItems) {
      const isGift = item.customAttributes?.some(
        (attr: any) => attr.key === "_HiddenNote" && attr.value === "GIFT"
      );

      if (isGift && item.contract?.id) {

        const fullGid = item.contract.id;
        const match = fullGid.match(/\/(\d+)$/);
        const contract_id = match ? match[1] : null; 

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

              // 📨 Generate PDF dynamically
          const pdfDoc = await PDFDocument.create();
          const page = pdfDoc.addPage([600, 400]);
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const { height } = page.getSize();

          page.drawText('Activate Your Gift Subscription', {
            x: 50,
            y: height - 80,
            size: 20,
            font,
            color: rgb(0.1, 0.2, 0.6),
          });

          page.drawText(`Activation ID: ${contract_id}`, {
            x: 50,
            y: height - 130,
            size: 16,
            font,
            color: rgb(0, 0, 0),
          });

          page.drawText('Thank you for receiving a gift subscription. Use this ID to activate it.', {
            x: 50,
            y: height - 180,
            size: 12,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });

          const pdfBytes = await pdfDoc.save();
          const pdfBase64 = Buffer.from(pdfBytes).toString('base64').replace(/\n/g, '');

          // 📧 Send email with PDF attached
          try {
            const response = await axios.post(
              'https://api.mailersend.com/v1/email',
              {
                from: {
                  email: 'noreply@app.chapon.com',
                  name: 'Test',
                },
                to: [{ email: note }],
                subject: 'Gift Product Activation ID',
                html: `
                  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
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
                  </div>
                `,
                text: `Activate your gift subscription with ID: ${contract_id}`,
                attachments: [
                  {
                    content: pdfBase64,
                    filename: 'activation-id.pdf',
                    disposition: 'attachment',
                    type: 'application/pdf',
                  },
                ],
              },
              {
                headers: {
                  Authorization: 'Bearer mlsn.5edcc9982dad7fdaea6535d4c2e12d626e9295ee0e8c64343db79fb813d86d60',
                  'Content-Type': 'application/json',
                },
              }
            );

            console.log('MailerSend: Email with PDF sent!', response.data);
          } catch (error: any) {
            console.error('MailerSend Email Error:', error.response?.data || error.message);
          }    
           


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
