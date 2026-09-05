(() => {

  const PURCHASE_URL =
    '/api/access?action=buy';

  const PURCHASE_MESSAGE =
    '有効な購入情報を確認できませんでした。購入済みの場合は、購入時と同じメールアドレスでログインしてください。';


  function addPurchaseLink() {

    if (
      document.getElementById(
        'urenaviPurchaseLink'
      )
    ) {
      return;
    }

    const loginBtn =
      document.getElementById(
        'loginBtn'
      );

    if (!loginBtn) {
      return;
    }

    const a =
      document.createElement(
        'a'
      );

    a.id =
      'urenaviPurchaseLink';

    a.href =
      PURCHASE_URL;

    a.textContent =
      'まだ購入していない方｜月額980円で始める';

    Object.assign(
      a.style,
      {
        display: 'block',
        marginTop: '12px',
        padding: '13px',
        border: '1px solid #e8b6ad',
        borderRadius: '13px',
        textAlign: 'center',
        textDecoration: 'none',
        color: '#a12e21',
        fontSize: '12px',
        fontWeight: '900',
        background: '#fff8f6'
      }
    );

    loginBtn.insertAdjacentElement(
      'afterend',
      a
    );

  }


  function applyActivationMessage() {

    const q =
      new URLSearchParams(
        window.location.search
      );

    if (
      q.get('activated') !==
      '1'
    ) {
      return;
    }

    const email =
      String(
        q.get('email') ||
        ''
      )
      .trim()
      .toLowerCase();

    const input =
      document.getElementById(
        'loginEmail'
      );

    const msg =
      document.getElementById(
        'authMsg'
      );

    if (
      email &&
      input
    ) {
      input.value =
        email;
    }

    if (msg) {

      msg.textContent =
        '購入ありがとうございます。購入登録が完了しました。購入時のメールアドレスでログインリンクを送ってください。';

      msg.className =
        'authMsg ok';

    }

  }


  async function getEntitlement(
    session
  ) {

    const email =
      String(
        session?.user?.email ||
        ''
      )
      .trim()
      .toLowerCase();

    if (!email) {

      return {
        allowed: false,
        error: false
      };

    }

    try {

      const {
        data,
        error
      } =
      await sb
      .from(
        'urenavi_entitlements'
      )
      .select(
        'status,active'
      )
      .eq(
        'email',
        email
      )
      .maybeSingle();

      if (error) {

        console.error(
          error
        );

        return {
          allowed: false,
          error: true
        };

      }

      return {
        allowed:
          data?.active ===
          true,
        error: false
      };

    } catch (e) {

      console.error(
        e
      );

      return {
        allowed: false,
        error: true
      };

    }

  }


  async function enforceAccess() {

    try {

      const {
        data: {
          session
        },
        error
      } =
      await sb.auth.getSession();

      if (error) {
        throw error;
      }

      if (!session) {

        addPurchaseLink();
        applyActivationMessage();

        return;
      }

      const result =
        await getEntitlement(
          session
        );

      if (
        result.allowed
      ) {

        return;
      }

      const appRoot =
        document.getElementById(
          'appRoot'
        );

      const authGate =
        document.getElementById(
          'authGate'
        );

      if (appRoot) {
        appRoot.style.display =
          'none';
      }

      if (authGate) {
        authGate.style.display =
          'flex';
      }

      addPurchaseLink();

      const msg =
        document.getElementById(
          'authMsg'
        );

      if (msg) {

        if (
          result.error
        ) {

          msg.textContent =
            '購入情報を確認できませんでした。通信状態を確認して、もう一度お試しください。';

        } else {

          msg.textContent =
            PURCHASE_MESSAGE;

        }

        msg.className =
          'authMsg err';

      }

    } catch (e) {

      console.error(
        e
      );

    }

  }


  addPurchaseLink();

  applyActivationMessage();

  void enforceAccess();


  sb.auth.onAuthStateChange(
    (
      event,
      session
    ) => {

      if (
        event ===
        'SIGNED_IN' ||
        event ===
        'TOKEN_REFRESHED' ||
        event ===
        'INITIAL_SESSION'
      ) {

        setTimeout(
          () => {
            void enforceAccess();
          },
          0
        );

      }

    }
  );

})();
