(() => {
  if (typeof post !== 'function') return;

  const basePost = post;

  window.post = (item, platform='room') => {
    const text = basePost(item, platform);
    if (platform !== 'room') return text;

    return text.replace(
      /\n\n気になる方はこちら👇\nhttps:\/\/[^\s]+\s*$/,
      '\n\n気になる方は商品画像をタップしてチェック👇'
    );
  };
})();
