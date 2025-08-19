import { json } from '@remix-run/node';

export async function action({ request }: { request: Request }) {
  const headers = {
    'Access-Control-Allow-Origin': '*', // Or a specific origin like 'https://app.chapon.com'
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
      const formData = await request.formData();
    const email = formData.get("email");
    const manageUrl="https://chapon-app.myshopify.com/account";
    const responseData = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        Authorization:
                  'Bearer mlsn.5edcc9982dad7fdaea6535d4c2e12d626e9295ee0e8c64343db79fb813d86d60',
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: {
          email: 'noreply@app.chapon.com',
          name: 'Chapon',
        },
        to: [{ email: email }],
         subject: 'Confirmation de mise en pause de votre abonnement',
        html: `
        <div> <img src='https://chapon-app.myshopify.com/cdn/shop/files/chapon.png' alt='Chapon Logo' style='max-width:150px;'><br><br> Bonjour,<br><br> Nous vous confirmons que votre abonnement a été mis en pause.<br><br> Vous pouvez décider de reprendre les envois quand vous le souhaitez en cliquant sur ce lien :<br> <a href="${manageUrl}">${manageUrl}</a><br><br> Nous vous souhaitons une très belle journée et à bientôt chez Chapon. </div>  `,
        text: `
Bonjour,

Nous vous confirmons que votre abonnement a été mis en pause.

Vous pouvez décider de reprendre les envois quand vous le souhaitez en cliquant sur ce lien :
${manageUrl}

Nous vous souhaitons une très belle journée et à bientôt chez Chapon.
        `.trim(),
      
      }),
    });
       return new Response(JSON.stringify({success:true}),{
            status:200,
            headers:headers
        })
    //  const formData = await request.formData();
    // const email = formData.get("email");
  
        


    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        Authorization:
                  'Bearer mlsn.5edcc9982dad7fdaea6535d4c2e12d626e9295ee0e8c64343db79fb813d86d60',
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: {
          email: 'noreply@app.chapon.com',
          name: 'Chapon',
        },
        to: [{ email: email }],
        subject: 'Confirmation de mise en pause de votre abonnement',
        html: `Bonjour,<br><br>...<a href="${manageUrl}">${manageUrl}</a>`,
        text: `Bonjour,\n\n...${manageUrl}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return json({ success: false, error: errorText }, { status: 500, headers });
    }

   return new Response(JSON.stringify({success:true}),{
            status:200,
            headers:headers
        })
  } catch (err: any) {
    // return json({ success: false, error: err.message }, { status: 200, headers });
      return new Response(JSON.stringify({ssuccess: false, error: err.message}),{
    headers:headers
  })
  }
}
