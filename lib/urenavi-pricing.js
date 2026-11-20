'use strict';
// Approved next-sale contract. Previous Stripe prices are legacy only.
// Never enable checkout or migrate existing subscriptions by changing this constant.
const MONTHLY_PRICE_JPY=1480;
const PLAN_ID='standard';
function validatesMonthlyPrice(price){
 return Boolean(price&&price.active===true&&price.currency==='jpy'&&
  price.unit_amount===MONTHLY_PRICE_JPY&&price.recurring?.interval==='month'&&
  price.recurring?.interval_count===1&&price.recurring?.usage_type!=='metered');
}
module.exports={MONTHLY_PRICE_JPY,PLAN_ID,validatesMonthlyPrice};
