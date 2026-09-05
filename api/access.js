const SUPABASE_URL='https://upooxcugrplfmjnqpuxs.supabase.co';

const LIVE_PAYMENT_LINK_URL=
'https://buy.stripe.com/dRm14nd9G7r1eDK2VPgfu00';

const LIVE_PAYMENT_LINK_ID=
'plink_1UB10QEYXoynxoEYCG0ONQkC';

const LIVE_PRICE_ID=
'price_1UAfsLEYXoynxoEYlxhQcJL9';


function env(name,fallback=''){
  return String(
    process.env[name]||
    fallback
  ).trim();
}


function stripeHeaders(){

  const key=
  env(
    'STRIPE_SECRET_KEY'
  );

  if(!key){
    throw new Error(
      'STRIPE_SECRET_KEY is missing'
    );
  }

  return{
    Authorization:
    `Bearer ${key}`
  };

}


async function stripeGet(path){

  const r=
  await fetch(
    `https://api.stripe.com${path}`,
    {
      headers:
      stripeHeaders()
    }
  );

  const data=
  await r.json()
  .catch(
    ()=>({})
  );

  if(!r.ok){

    throw new Error(
      data?.error?.message||
      `Stripe error ${r.status}`
    );

  }

  return data;

}


function serviceHeaders(extra={}){

  const key=
  env(
    'SUPABASE_SERVICE_ROLE_KEY'
  );

  if(!key){

    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing'
    );

  }

  return{
    apikey:key,
    Authorization:
    `Bearer ${key}`,
    ...extra
  };

}


async function ensureAuthUser(email){

  const r=
  await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users`,
    {
      method:'POST',
      headers:
      serviceHeaders({
        'Content-Type':
        'application/json'
      }),
      body:
      JSON.stringify({
        email,
        email_confirm:true
      })
    }
  );

  if(r.ok){
    return;
  }

  const data=
  await r.json()
  .catch(
    ()=>({})
  );

  const raw=
  JSON.stringify(data)
  .toLowerCase();

  if(
    r.status===422||
    raw.includes('already')||
    raw.includes('registered')||
    raw.includes('exists')
  ){
    return;
  }

  throw new Error(
    data?.msg||
    data?.message||
    `Supabase user error ${r.status}`
  );

}


async function upsertEntitlement(row){

  const r=
  await fetch(
    `${SUPABASE_URL}/rest/v1/urenavi_entitlements?on_conflict=email`,
    {
      method:'POST',
      headers:
      serviceHeaders({
        'Content-Type':
        'application/json',
        Prefer:
        'resolution=merge-duplicates,return=minimal'
      }),
      body:
      JSON.stringify(row)
    }
  );

  if(!r.ok){

    const text=
    await r.text();

    throw new Error(
      text||
      `Entitlement update error ${r.status}`
    );

  }

}


function absoluteAppUrl(req,params={}){

  const proto=
  String(
    req.headers[
      'x-forwarded-proto'
    ]||
    'https'
  )
  .split(',')[0];

  const host=
  String(
    req.headers[
      'x-forwarded-host'
    ]||
    req.headers.host||
    'rakuten-affiliate-ai-mobile.vercel.app'
  )
  .split(',')[0];

  const u=
  new URL(
    '/app.html',
    `${proto}://${host}`
  );

  for(
    const [k,v]
    of Object.entries(params)
  ){

    if(v!=null){
      u.searchParams.set(
        k,
        String(v)
      );
    }

  }

  return u.toString();

}


module.exports=
async function handler(req,res){

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  const action=
  String(
    req.query.action||
    ''
  )
  .toLowerCase();


  try{

    if(
      action==='buy'
    ){

      const url=
      env(
        'URENAVI_PAYMENT_LINK_URL',
        LIVE_PAYMENT_LINK_URL
      );

      return res.redirect(
        302,
        url
      );

    }


    if(
      action!=='activate'
    ){

      return res
      .status(400)
      .json({
        message:
        'invalid action'
      });

    }


    const sessionId=
    String(
      req.query.session_id||
      ''
    )
    .trim();


    if(
      !/^cs_/.test(
        sessionId
      )
    ){

      return res
      .status(400)
      .send(
        'Invalid checkout session.'
      );

    }


    const session=
    await stripeGet(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`
    );


    if(
      session.mode!==
      'subscription'||
      session.status!==
      'complete'
    ){

      return res
      .status(400)
      .send(
        'Checkout is not complete.'
      );

    }


    const expectedLink=
    env(
      'URENAVI_PAYMENT_LINK_ID',
      LIVE_PAYMENT_LINK_ID
    );


    if(
      expectedLink&&
      session.payment_link!==
      expectedLink
    ){

      return res
      .status(403)
      .send(
        'This purchase is not for Urenavi.'
      );

    }


    const lineItems=
    await stripeGet(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=10`
    );


    const expectedPrice=
    env(
      'URENAVI_PRICE_ID',
      LIVE_PRICE_ID
    );


    const priceOk=
    Array.isArray(
      lineItems.data
    )&&
    lineItems.data.some(
      x=>
      x?.price?.id===
      expectedPrice
    );


    if(
      !priceOk
    ){

      return res
      .status(403)
      .send(
        'Unexpected subscription plan.'
      );

    }


    const subscriptionId=
    typeof session.subscription===
    'string'
    ?
    session.subscription
    :
    session.subscription?.id;


    if(
      !subscriptionId
    ){

      return res
      .status(400)
      .send(
        'Subscription was not created.'
      );

    }


    const sub=
    await stripeGet(
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`
    );


    const active=
    [
      'active',
      'trialing'
    ]
    .includes(
      String(
        sub.status
      )
    );


    if(
      !active
    ){

      return res
      .status(403)
      .send(
        'Subscription is not active.'
      );

    }


    const email=
    String(
      session?.
      customer_details?.
      email||
      session?.
      customer_email||
      ''
    )
    .trim()
    .toLowerCase();


    if(
      !email
    ){

      return res
      .status(400)
      .send(
        'Customer email is missing.'
      );

    }


    await ensureAuthUser(
      email
    );


    await upsertEntitlement({
      email,
      stripe_customer_id:
      typeof session.customer===
      'string'
      ?
      session.customer
      :
      session.customer?.id||
      null,
      stripe_subscription_id:
      subscriptionId,
      status:
      String(
        sub.status||
        'active'
      ),
      active:true,
      current_period_end:
      sub.current_period_end
      ?
      new Date(
        sub.current_period_end*
        1000
      ).toISOString()
      :
      null,
      updated_at:
      new Date()
      .toISOString()
    });


    return res.redirect(
      302,
      absoluteAppUrl(
        req,
        {
          activated:'1',
          email
        }
      )
    );


  }catch(e){

    console.error(
      e
    );

    return res
    .status(500)
    .send(
      '利用開始処理を完了できませんでした。時間をおいて再度お試しください。'
    );

  }

};
