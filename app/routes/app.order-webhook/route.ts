import {json, ActionFunction} from '@remix-run/node';
import {PrismaClient} from '@prisma/client';
import nodemailer from 'nodemailer';
import axios from 'axios';
import {PDFDocument, rgb, StandardFonts} from 'pdf-lib';
import {Buffer} from 'buffer';
const prisma = new PrismaClient();

function addOneMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

interface SubscriptionEntry {
  title: string;
  nextBillingDate?: string;
  count?: number;
  duration?: number;
}

export const action: ActionFunction = async ({request}) => {
  console.log('==============CALLED============');
  try {
    const payload = await request.json();

    const orderId = payload?.id;
    const orderStatusUrl = payload?.order_status_url;
    const {customer, tags} = payload;
    if (!orderId || !orderStatusUrl) {
      return json({error: 'Missing order ID or status URL'}, {status: 400});
    }

    const shopMatch = orderStatusUrl.match(/https:\/\/(.+?)\.myshopify\.com/);
    const shop = shopMatch ? `${shopMatch[1]}.myshopify.com` : null;

    if (!shop) {
      return json({error: 'Unable to extract shop domain'}, {status: 400});
    }

    // Get access token for the shop
    const session = await prisma.session.findFirst({
      where: {shop},
      select: {accessToken: true},
    });

    if (!session?.accessToken) {
      return json({error: 'Access token not found for shop'}, {status: 404});
    }
    const accessToken = session.accessToken;

    try {
      const customerGID = `gid://shopify/Customer/${customer.id}`;
      console.log('order_customer___', customerGID);

      const currentDate = new Date().toISOString().split('T')[0];
      const nextBilling = addOneMonth(currentDate);
      const fetchMetafieldsQuery = `
      query {
        customer(id: "${customerGID}") {
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
    `;

      const fetchResponse = await fetch(
        `https://${shop}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            query: fetchMetafieldsQuery,
          }),
        },
      );
      const fetchData = await fetchResponse.json();
      const customerData = fetchData?.data?.customer;
      let existingSubscriptions = [] as SubscriptionEntry[];
      const metafieldNode = customer.metafields.edges.find( (m) => m.node.key === 'subscription_data' )?.node;
      if (metafieldNode?.value) {
        try {
          existingSubscriptions = JSON.parse(metafieldNode.value);
        } catch (e) {
          existingSubscriptions = [];
        }
      }

      // const existingTagss = Array.isArray(tags) ? tags : [];
      const tagString = tags ?? '';
      const existingTagss = tagString.split(',').map((tag) => tag.trim());

      const renewalTag = existingTagss.includes('subscription_renewal');
      const subscriptionTag = existingTagss.find((tag) =>
        tag.startsWith('subscription-'),
      );

      console.log('subscriptionTag_____', renewalTag, subscriptionTag);

      if (renewalTag && subscriptionTag) {
        const subscriptionIndex = existingSubscriptions.findIndex(
          (entry: any) => entry?.title === subscriptionTag,
        );

        if (subscriptionIndex !== -1) {
          const updatedSubscription = existingSubscriptions[subscriptionIndex];
          const newCount = (updatedSubscription.count || 0) + 1;

          if (
            typeof updatedSubscription.duration === 'number' &&
            newCount >= updatedSubscription.duration
          ) {
            existingSubscriptions.splice(subscriptionIndex, 1);
          } else {
            updatedSubscription.count = newCount;
            updatedSubscription.nextBillingDate = nextBilling;
            existingSubscriptions[subscriptionIndex] = updatedSubscription;
          }
        }

        const metafieldsSetMutation = `
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                key
                namespace
                value
                createdAt
                updatedAt
              }
              userErrors {
                field
                message
                code
              }
            }
          }
        `;

        const variables = {
          metafields: [
            {
              key: 'subscription_data',
              namespace: 'custom',
              ownerId: customerGID,
              value: JSON.stringify(existingSubscriptions),
              type: 'multi_line_text_field',
            },
          ],
        };

        const metafieldSetResponse = await fetch(
          `https://${shop}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query: metafieldsSetMutation,
              variables: variables,
            }),
          },
        );
        const metafieldSetData = await metafieldSetResponse.json();

        if (metafieldSetData.data.metafieldsSet.userErrors.length > 0) {
          throw new Error(
            JSON.stringify(metafieldSetData.data.metafieldsSet.userErrors),
          );
        }
      }
    } catch (err: any) {
      console.error('Error handling subscription logic:', err);
      return json(
        {error: 'Failed to update subscription data', details: err?.message},
        {status: 500},
      );
    }

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
              variantTitle
              contract {
                id
                billingPolicy {
                  interval
                  intervalCount
                }
              }
            }
          }
        }
      }
    `;

    const orderGid = `gid://shopify/Order/${orderId}`;

    const graphqlResponse = await fetch(
      `https://${shop}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: gqlQuery,
          variables: {orderId: orderGid},
        }),
      },
    );

    const result = await graphqlResponse.json();

    const note = result?.data?.order?.note;
    const customerEmail = result?.data?.order?.customer.email;
    console.log('customerEmail___:', customerEmail);

    console.log(JSON.stringify(result, null, 2));

    const lineItems = result?.data?.order?.lineItems?.nodes || [];
    const orderEmail =
      result?.data?.order?.email || result?.data?.order?.customer?.email;

    for (const item of lineItems) {
      const isGift = item.customAttributes?.some(
        (attr: any) => attr.key === '_HiddenNote' && attr.value === 'GIFT',
      );

      if (isGift && item.contract?.id) {
        const quantity = item.quantity;
        const fullGid = item.contract.id;
        const match = fullGid.match(/\/(\d+)$/);
        const contract_id = match ? match[1] : null;
        const recipientEmail = item.customAttributes?.find(
          (attr: any) => attr.key === 'Pour',
        )?.value;
        const senderEmail = item.customAttributes?.find(
          (attr: any) => attr.key === 'De',
        )?.value;
          const gift_message = item.customAttributes?.find(
          (attr: any) => attr.key === 'Message',
        )?.value;
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

        const pauseResponse = await fetch(
          `https://${shop}/admin/api/2023-10/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query: pauseMutation,
              variables: {
                contractId: item.contract.id,
              },
            }),
          },
        );

        const pauseResult = await pauseResponse.json();
        const errors = pauseResult?.data?.subscriptionContractPause?.userErrors;

        const draftMutation = `
                mutation subscriptionContractUpdate($contractId: ID!) { subscriptionContractUpdate(contractId: $contractId) { draft { id } userErrors { field message } } }
              `;

        const draftResponse = await fetch(
          `https://${shop}/admin/api/2023-10/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query: draftMutation,
              variables: {
                contractId: item.contract.id, // or use contract_id if you extracted it
              },
            }),
          },
        );

        const draftData = await draftResponse.json();
        // Safely extract the draft ID
        const draftId =
          draftData?.data?.subscriptionContractUpdate?.draft?.id || null;

        const fullGid1 = draftId;
        const match1 = fullGid1.match(/\/(\d+)$/);
        const contract_id1 = match1 ? match1[1] : null;

       
        const pdfBase64 = await createGiftSubscriptionPDF({
         sender:senderEmail,
          activationCode: contract_id1,
          message: gift_message||"",
          chocolateType: item.variantTitle,
          duration: item.contract.billingPolicy.intervalCount,
          recipient: recipientEmail,
        });

        // 📧 Send email with PDF attached
        try {
          const response = await axios.post(
            'https://api.mailersend.com/v1/email',
            {
              from: {
                email: 'noreply@app.chapon.com',
                name: 'Chapon',
              },
              to: [{email: customerEmail.toString()}],
              subject: 'Carte Cadeau abonnement ! 🎁 ',
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
                  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
                    <h2 style="color: #000000ff;">🎁 Activez votre abonnement cadeau Chapon</h2>
                    <p>Bonjour,</p>
                    <p>Vous trouverez en pièce jointe votre carte cadeau.<br>
                    Elle contient un <strong>code à usage unique</strong> que votre destinataire devra renseigner pour activer son abonnement.</p>

                    <p><strong>Pour activer un abonnement :</strong></p>
                    <ol>
                      <li>Rendez-vous sur : <a href="https://chapon.com/pages/activation-abonnement">https://chapon.com/pages/activation-abonnement</a></li>
                      <li>Renseignez votre code dans l’espace dédié</li>
                    
                      <li>📦 Une fois activé, l’abonnement démarre : le premier envoi sera préparé avec soin et expédié dans les jours suivants.</li>
                    </ol>

                    <p>Nous vous remercions de nouveau d’avoir souscrit à cet abonnement.</p>
                    <p>Nous vous souhaitons une très belle journée et à bientôt chez Chapon.</p>
                    <p>L’équipe Chapon Chocolatier</p>

                    <hr style="margin-top: 30px; border: none; border-top: 1px solid #e0e0e0;">
                    <p style="font-size: 12px; color: #888;">Cet email a été envoyé par l'application Chapon.</p>
                  </div>
                </div>
                `,
              text: `Activate your gift subscription with ID: ${contract_id1}`,
              attachments: [
                {
                  content: pdfBase64,
                  filename: "Carte cadeau chapon.pdf",
                  disposition: 'attachment',
                  type: 'application/pdf',
                },
              ],
            },
            {
              headers: {
                Authorization:
                  'Bearer mlsn.5edcc9982dad7fdaea6535d4c2e12d626e9295ee0e8c64343db79fb813d86d60',
                'Content-Type': 'application/json',
              },
            },
          );

          console.log('MailerSend: Email with PDF sent!', response.data);
        } catch (error: any) {
          console.error(
            'MailerSend Email Error:',
            error.response?.data || error.message,
          );
        }

        if (errors?.length) {
          return json(
            {error: 'Pause failed', userErrors: errors},
            {status: 400},
          );
        }

        break;
      }
    }

    return json({success: true});
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return json(
      {error: 'Internal Server Error', details: error.message},
      {status: 500},
    );
  }
};




async function createGiftSubscriptionPDF({
  sender = 'DE LA PART DE :',
  activationCode = 'XXXX-XXXX',
  message = 'MESSAGE : ',
  chocolateType = 'Mixte Noir',
  duration = 3,
  recipient = 'POUR :',
}) {
 
const pdfDoc = await PDFDocument.create();
const page1 = pdfDoc.addPage([600, 400]);
const { width, height } = page1.getSize();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + word).length > maxCharsPerLine) {
      lines.push(line.trim());
      line = '';
    }
    line += word + ' ';
  }
  if (line) lines.push(line.trim());
  return lines;
}

const fontSize = 12;
const smallfontSize = 8;
const titleFontSize = 24;
const chocolateTypeCondition = chocolateType.includes("Noir")
  ? "(   ) Mixte    ( * ) Noir"
  : "( * ) Mixte    (   ) Noir";
const durationCondition =
  duration == 3
    ? "( * ) 3 mois    (   ) 6 mois    (   ) 12 mois"
    : duration == 6
    ? "(   ) 3 mois    ( * ) 6 mois    (   ) 12 mois"
    : "(   ) 3 mois    (   ) 6 mois    ( * ) 12 mois";

page1.drawRectangle({
  x: 0,
  y: 0,
  width: width,
  height: height,
  color: rgb(1.0, 0.9725, 0.9804),
});
// === Title ===
page1.drawText('Bon cadeau', {
  x: 30,
  y: height - 50,
  size: titleFontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText('Abonnement tablettes', {
  x: 30,
  y: height - 80,
  size: fontSize + 4,
  font,
  color: rgb(0, 0, 0),
});

let yPosition = height - 120;

// === CODE ACTIVATION ===
page1.drawText('CODE ACTIVATION :', {
  x: 30,
  y: yPosition,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText(activationCode, {
  x: 32,
  y: yPosition - 25,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText('......................................................................', {
  x: 30,
  y: yPosition - 30,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});

yPosition -= 70;

// === DE LA PART DE ===
page1.drawText('DE LA PART DE :', {
  x: 30,
  y: yPosition,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText(sender, {
  x: 32,
  y: yPosition - 25,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText('......................................................................', {
  x: 30,
  y: yPosition - 30,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});

yPosition -= 70;

// === POUR ===
page1.drawText('POUR :', {
  x: 30,
  y: yPosition,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText(recipient, {
  x: 32,
  y: yPosition - 25,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText('......................................................................', {
  x: 30,
  y: yPosition - 30,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});

yPosition -= 70;

// === MESSAGE ===
page1.drawText('MESSAGE :', {
  x: width / 2 + 20,
  y: height - 120,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
const messageLines = wrapText(message, 50);
let messageY = height - 150;
for (let i = 0; i < 5; i++) {
  const line = messageLines[i] || '';
  page1.drawText(line, {
    x: width / 2 + 20,
    y: messageY,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  page1.drawText('......................................................................', {
    x: width / 2 + 20,
    y: messageY - 5,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  messageY -= 25;
}

// === DURÉE ===
page1.drawText('DURÉE :', {
  x: 30,
  y: yPosition,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText(durationCondition, {
  x: 30,
  y: yPosition - 20,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});

// === CHOCOLAT ===
page1.drawText('CHOCOLAT :', {
  x: width / 2 + 20,
  y: yPosition,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});
page1.drawText(chocolateTypeCondition, {
  x: width / 2 + 20,
  y: yPosition - 20,
  size: fontSize,
  font,
  color: rgb(0, 0, 0),
});

yPosition -= 55;

// === URL ===
// page1.drawText('Activez votre abonnement sur https://chapon-app.myshopify.com/pages/activate-subscription', {
page1.drawText('Activez votre abonnement sur https://chapon.com/pages/activation-abonnement.com', {
  x: width / 2 - 155,
  y: yPosition,
  size: smallfontSize,
  font,
  color: rgb(0, 0, 0),
});

    // Add second page (blank)
    const imageUrl =
      'https://cdn.shopify.com/s/files/1/0913/4365/1158/files/Chapon_e_cartes_A6_148x105mm_HD__4__pdf_1.jpg?v=1756354855';
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('Failed to fetch image');
    const arrayBuffer = await imgRes.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);

    // Embed the image (assuming PNG, use embedJpg for JPEG)
    const image = await pdfDoc.embedJpg(imageBytes);
    const page2 = pdfDoc.addPage([600, 400]);
    page2.drawImage(image, {
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64').replace(/\n/g, '');

  return pdfBase64;
}
