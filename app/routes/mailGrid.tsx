// app/routes/mailGrid.tsx

import { json, type LoaderFunction, type ActionFunction } from '@remix-run/node';
import { useActionData, useLoaderData, Form } from '@remix-run/react';
import axios from 'axios';

// 👉 Loader handles GET requests
export const loader: LoaderFunction = async () => {
  return json({ message: 'You can send a test email using the form below.' });
};

// 👉 Action handles POST requests
export const action: ActionFunction = async () => {
  try {
    const response = await axios.post(
      'https://api.mailersend.com/v1/email',
      {
        from: {
          email: 'MS_vV9Jr2@test-yxj6lj9nr9q4do2r.mlsender.net',
          name: 'Test',
        },
        to: [{ email: 'semedig615@hazhab.com' }],
        subject: 'Test Email from Remix + MailerSend',
        html: '<h1>Hello from MailerSend + Remix!</h1><p>This is a test email.</p>',
        text: 'Hello from MailerSend + Remix! This is a test email.',
      },
      {
        headers: {
          Authorization: 'Bearer mlsn.d1cedfaa0b7944139ba173f0a3f6a91d92ab5fab3251f5c1515b510d2415dc71', // ✅ Secure: use env var
          'Content-Type': 'application/json',
        },
      }
    );

    return json({ success: true, message: 'Email sent successfully!' });
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
