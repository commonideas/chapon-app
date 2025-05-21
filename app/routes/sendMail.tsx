import { json, type ActionFunction, type LoaderFunction } from '@remix-run/node';
import { useActionData, Form } from '@remix-run/react';
import nodemailer from 'nodemailer';

type ActionResponse = {
  success?: string;
  error?: string;
};

export const action: ActionFunction = async (): Promise<Response> => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'ssl0.ovh.net',
      port: 465,
      secure: true,
      auth: {
        user: 'test@common-ideas.com',
        pass: 'Puu169uKhMepZDNb',
      },
    });

    await transporter.sendMail({
      from: 'test@common-ideas.com',
      to: 'tester1.kaswebtechsolutions@gmail.com',
      subject: 'Test Email from Shopify App',
      text: 'This is a test email sent directly from your Shopify app using SMTP!',
      html: '<p>This is a test email sent directly from Server</p>',
    });

    return json<ActionResponse>({ success: '✅ Email sent successfully!' });
  } catch (error: any) {
    console.error('Email error:', error);
    return json<ActionResponse>({ error: `❌ Failed to send email: ${error.message}` }, { status: 500 });
  }
};

export default function SendEmailTest() {
  const result = useActionData<ActionResponse>();

  return (
    <div style={{ padding: '1rem', fontFamily: 'Arial' }}>
      <h2>Send Test Email</h2>
      <Form method="post">
        <button type="submit" style={{ padding: '0.5rem 1rem', fontSize: '16px' }}>
          📧 Send Email
        </button>
      </Form>
      {result?.success && <p style={{ color: 'green', marginTop: '1rem' }}>{result.success}</p>}
      {result?.error && <p style={{ color: 'red', marginTop: '1rem' }}>{result.error}</p>}
    </div>
  );
}
