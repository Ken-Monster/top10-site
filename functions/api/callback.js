function renderBody(status, content) {
    const html = `
    <script>
      var authorizingTimer = null;
      var tokenSentCount = 0;
      function postAuthorizing() {
        if (window.opener) {
          window.opener.postMessage('authorizing:github', '*');
        }
      }
      function postToken() {
        if (window.opener) {
          window.opener.postMessage('authorization:github:success:' + JSON.stringify(${JSON.stringify(content)}), '*');
        }
        tokenSentCount += 1;
        var el = document.getElementById('sent');
        if (!el) {
          el = document.createElement('h2');
          el.id = 'sent';
          document.body.appendChild(el);
        }
        el.textContent = 'TOKEN SENT x' + tokenSentCount;
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
      document.write('<h1>WAITING</h1><p>opener: ' + (window.opener ? 'present' : 'NULL') + '</p>');
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
