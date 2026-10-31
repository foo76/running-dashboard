// MyFitnessDB browser authentication.
// This is a public publishable key, not a password or secret key.
(function () {
  const url = 'https://krgbagjignvbnrgybdos.supabase.co';
  const key = 'sb_publishable_qNga415U3UwHSNF1DF5RiQ_5MzhIFFq';
  const client = window.supabase.createClient(url, key);

  let pending;
  let resolvePending;
  let gate;

  function showGate(message = '') {
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'myfitness-auth-gate';
      gate.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:#08111e;' +
        'color:#eef5ff;display:grid;place-items:center;font:16px system-ui,sans-serif;padding:20px';

      gate.innerHTML = `
        <form style="width:min(100%,360px);background:#132235;border:1px solid #35506b;border-radius:16px;padding:24px">
          <h1 style="font-size:22px;margin:0 0 8px">MyFitnessDB</h1>
          <p style="margin:0 0 20px;color:#afc5db">Sign in to view your training data.</p>

          <label style="display:block;margin-bottom:12px">
            Email
            <input type="email" name="email" autocomplete="username" required
              style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;background:#fff;color:#111;border:0;border-radius:8px">
          </label>

          <label style="display:block;margin-bottom:16px">
            Password
            <input type="password" name="password" autocomplete="current-password" required
              style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;background:#fff;color:#111;border:0;border-radius:8px">
          </label>

          <button type="submit"
            style="width:100%;padding:12px;background:#38bdf8;color:#06101d;border:0;border-radius:8px;font-weight:700;cursor:pointer">
            Sign in
          </button>
          <p role="alert" style="min-height:20px;color:#ff9da5;margin:12px 0 0"></p>
        </form>`;

      document.body.appendChild(gate);
      const form = gate.querySelector('form');

      form.addEventListener('submit', async event => {
        event.preventDefault();

        const button = form.querySelector('button');
        const alert = form.querySelector('[role=alert]');
        button.disabled = true;
        alert.textContent = '';

        let error;
        try {
          ({ error } = await client.auth.signInWithPassword({
            email: form.elements.email.value,
            password: form.elements.password.value
          }));
        } catch (_) {
          error = new Error('Sign in failed. Check your connection and try again.');
        }

        form.elements.password.value = '';
        button.disabled = false;

        if (error) {
          alert.textContent = error.message;
          return;
        }

        gate.remove();
        gate = null;
        addSignOut();
        if (resolvePending) resolvePending();
      });
    }

    gate.querySelector('[role=alert]').textContent = message;
  }

  function addSignOut() {
    if (document.getElementById('myfitness-sign-out')) return;

    const button = document.createElement('button');
    button.id = 'myfitness-sign-out';
    button.type = 'button';
    button.textContent = 'Sign out';
    button.setAttribute('aria-label', 'Sign out of MyFitnessDB');
    button.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:2147483646;' +
      'padding:7px 10px;border:1px solid #69829c;border-radius:8px;' +
      'background:#132235;color:#fff;font:12px system-ui;cursor:pointer';

    button.addEventListener('click', async () => {
      await client.auth.signOut();
      location.reload();
    });

    document.body.appendChild(button);
  }

  async function requireSession() {
    if (!pending) {
      pending = (async () => {
        const { data: { user }, error } = await client.auth.getUser();

        if (user && !error && !user.is_anonymous) {
          addSignOut();
          return;
        }

        showGate();
        await new Promise(resolve => {
          resolvePending = resolve;
        });
      })();
    }

    await pending;

    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      pending = null;
      return requireSession();
    }

    return session;
  }

  async function headers() {
    const session = await requireSession();
    return {
      apikey: key,
      Authorization: 'Bearer ' + session.access_token
    };
  }

  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      pending = null;
      if (document.body) location.reload();
    }
  });

  window.MyFitnessAuth = { client, requireSession, headers, key, url };
})();
