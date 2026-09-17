document.addEventListener('DOMContentLoaded',function(){
  const priceSection=document.querySelector('#price');
  if(!priceSection||document.querySelector('#room-guides')) return;
  const section=document.createElement('section');
  section.className='section alt';
  section.id='room-guides';
  section.innerHTML=`<div class="wrap"><h2 class="title">楽天ROOMお役立ち記事</h2><p class="desc">商品選び・投稿文・始め方で迷ったときに読める、初心者向けガイドです。</p><div class="seoGrid"><a class="seoBox" href="/rakuten-room-product-choice.html"><b>楽天ROOMで売れる商品が分からない人へ</b><p>レビュー・評価・価格・料率など、商品選びの基本を整理します。</p></a><a class="seoBox" href="/rakuten-room-post-copy.html"><b>楽天ROOMの投稿文が書けない人へ</b><p>売り込みっぽくならない紹介文の作り方と、使いやすい文章の型を紹介します。</p></a><a class="seoBox" href="/rakuten-room-beginner-guide.html"><b>楽天ROOM初心者が最初にやること</b><p>商品選びから最初の投稿まで、迷わず進める流れを7ステップで解説します。</p></a></div></div>`;
  priceSection.parentNode.insertBefore(section,priceSection);
});
