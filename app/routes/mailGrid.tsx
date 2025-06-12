// app/routes/mailGrid.tsx

import { json, type LoaderFunction, type ActionFunction } from '@remix-run/node';
import { useActionData, useLoaderData, Form } from '@remix-run/react';
import axios from 'axios';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'; // 👈 added for PDF generation
import { Buffer } from 'buffer'; // 👈 required for base64 conversion

// 👉 Loader handles GET requests
export const loader: LoaderFunction = async () => {
  return json({ message: 'You can send a test email using the form below.' });
};

// 👉 Action handles POST requests
export const action: ActionFunction = async () => {
  try {
    // 🔧 Create PDF in memory
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();

    page.drawText('Hello from MailerSend + Remix!', {
      x: 50,
      y: height - 100,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText('Attached is your PDF file.', {
      x: 50,
      y: height - 150,
      size: 16,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    // 📨 Send email with PDF attachment
    const response = await axios.post(
      'https://api.mailersend.com/v1/email',
      {
        from: {
          email: 'noreply@app.chapon.com',
          name: 'Test',
        },
        to: [{ email: 'mikocag522@3dboxer.com' }],
        subject: 'Test Email from Remix + MailerSend',
        html: '<h1>Hello from MailerSend + Remix!</h1><p>This is a test email.</p>',
        text: 'Hello from MailerSend + Remix! This is a test email.',
      attachments: [
          {
            content: pdfBase64,
            type: "application/pdf",
            filename: "activation-id.pdf",
            disposition: "attachment"
          }
        ]

      },
      {
        headers: {
          Authorization: 'Bearer mlsn.5edcc9982dad7fdaea6535d4c2e12d626e9295ee0e8c64343db79fb813d86d60', // 🔐 Move to .env in production
          'Content-Type': 'application/json',
        },
      }
    );

    return json({ success: true, message: 'Email with PDF sent successfully!' });
  } catch (error: any) {
    console.error('MailerSend API Error:', error.response?.data || error.message);
    return json(
      {
        success: false,
        error: error.response?.data?.message || error.message || 'Unknown error occurred.',
      },
      { status: 500 }
    );
  }
};

// 👉 UI Component
export default function MailGrid() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<{
    success?: boolean;
    message?: string;
    error?: string;
  }>();

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Send Test Email</h1>
      <p>{loaderData.message}</p>

      {/* Success Message */}
      {actionData?.success && (
        <p style={{ color: 'green', fontWeight: 'bold' }}>{actionData.message}</p>
      )}

      {/* Error Message */}
      {actionData?.error && (
        <p style={{ color: 'red', fontWeight: 'bold' }}>Error: {actionData.error}</p>
      )}

      {/* Email Send Form */}
      <Form method="post">
        <button type="submit">Send Email!</button>
      </Form>
    </div>
  );
}
