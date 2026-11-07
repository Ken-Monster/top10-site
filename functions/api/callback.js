function renderBody(status, content) {
    const html = `
    <script>
      var authorizingTimer = null;
      function postAuthorizing() {
        if (window.opener) {
          window.opener.postMessage('authorizing:github', '*');
        }
      }
      function postToken() {
        if (window.opener) {
          window.opener.postMessage('authorization:github:success:' + JSON.stringify(${JSON.stringify(content)}), '*');
        }
      }
      window.addEventListener("message", function (message) {
        postToken();
        setTimeout(postToken, 300);
        setTimeout(postToken, 900);
        if (authorizingTimer) {
          clearInterval(authorizingTimer);
          authorizingTimer = null;
        }
      }, false);
      postAuthorizing();
      var authorizingAttempts = 0;
      authorizingTimer = setInterval(function () {
        authorizingAttempts += 1;
        postAuthorizing();
        if (authorizingAttempts >= 8) {
          clearInterval(authorizingTimer);
          authorizingTimer = null;
        }
      }, 400);
    </script>
    `;
    const blob = new Blob([html]);
    return blob;
}

export async function onRequest(context) {
    const {
        request, // same as existing Worker API
        env, // same as existing Worker API
        params, // if filename includes [id] or [[path]]
        waitUntil, // same as ctx.waitUntil in existing Worker API
        next, // used for middleware or to fetch assets
        data, // arbitrary space for passing data between middlewares
    } = context;

    const client_id = env.GITHUB_CLIENT_ID;
    const client_secret = env.GITHUB_CLIENT_SECRET;

    try {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const response = await fetch(
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'user-agent': 'cloudflare-functions-github-oauth-login-demo',
                    'accept': 'application/json',
                },
                body: JSON.stringify({ client_id, client_secret, code }),
            },
        );
        const result = await response.json();
        if (result.error) {
            return new Response(renderBody('error', result), {
                headers: {
                    'content-type': 'text/html;charset=UTF-8',
                },
                status: 401 
            });
        }
        const token = result.access_token;
        const provider = 'github';
        // TEMP DIAGNOSTIC: verify the token server-side (never logs the token itself)
        try {
            const meRes = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `token ${token}`,
                    'user-agent': 'cloudflare-functions-github-oauth-login-demo',
                    Accept: 'application/json',
                },
            });
            const meScopes = meRes.headers.get('x-oauth-scopes');
            let meLogin = '';
            try {
                const meJson = await meRes.json();
                meLogin = meJson.login || '';
            } catch (e) { meLogin = '(unparsable)'; }
            console.log('DIAG token check: status=' + meRes.status + ' login=' + meLogin + ' scopes=' + meScopes);
            const repoRes = await fetch('https://api.github.com/repos/Ken-Monster/top10-site', {
                headers: {
                    Authorization: `token ${token}`,
                    'user-agent': 'cloudflare-functions-github-oauth-login-demo',
                    Accept: 'application/json',
                },
            });
            const repoJson = await repoRes.json().catch(() => ({}));
            const perms = repoJson.permissions || null;
            console.log('DIAG repo check: status=' + repoRes.status + ' permissions=' + JSON.stringify(perms));
        } catch (diagErr) {
            console.log('DIAG check failed: ' + diagErr.message);
        }
        const responseBody = renderBody('success', {
            token,
            provider,
        });
        return new Response(responseBody, { 
            headers: {
                'content-type': 'text/html;charset=UTF-8',
            },
            status: 200 
        });

    } catch (error) {
        console.error(error);
        return new Response(error.message, {
            headers: {
                'content-type': 'text/html;charset=UTF-8',
            },
            status: 500,
        });
    }
}
