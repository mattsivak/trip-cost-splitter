# Deploy Trip Cost Splitter with Portainer + Cloudflare

Target local origin:

- Container: `trip-cost-splitter`
- Container port: `3000`
- Host loopback port: `127.0.0.1:3087`
- nginx loopback router: `127.0.0.1:9119`
- Suggested public hostname: `trips.mattsivak.me`

## 1. Build image on the Docker host

From `/root/workspace/trip-cost-splitter`:

```bash
docker compose build
```

This creates local image `trip-cost-splitter:latest`.

## 2. Start via Portainer

In Portainer:

1. Go to **Stacks** → **Add stack**.
2. Name: `trip-cost-splitter`.
3. Paste `portainer-stack.yml`.
4. Deploy.

If the local image is not visible to Portainer, use the regular `docker-compose.yml` from the project directory instead, or push the image to a registry and update `image:`.

## 3. Local verification

```bash
curl -sS -D - http://127.0.0.1:3087/ | head
```

Expected: HTTP 200 and page contains `Trip Cost Splitter`.

## 4. nginx loopback vhost

Create `/etc/nginx/conf.d/trip-cost-splitter.conf`:

```nginx
server {
    listen 127.0.0.1:9119;
    server_name trips.mattsivak.me;

    location / {
        proxy_pass http://127.0.0.1:3087;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Then:

```bash
nginx -t && systemctl reload nginx
curl -sS -D - -H 'Host: trips.mattsivak.me' http://127.0.0.1:9119/ | head
```

## 5. Cloudflare route

In Cloudflare Zero Trust → Networks → Tunnels → existing tunnel:

- Public hostname: `trips.mattsivak.me`
- Service type: `HTTP`
- URL: `127.0.0.1:9119`

Alternatively, create a proxied CNAME for `trips.mattsivak.me` to the tunnel’s `<tunnel-id>.cfargotunnel.com` if using DNS-level routing.

## 6. Public verification

```bash
curl -sS -D - https://trips.mattsivak.me/ -o /tmp/trip-cost-splitter.html
rg -n "Trip Cost Splitter" /tmp/trip-cost-splitter.html
```

If public DNS is not set yet, local nginx can still be verified with the Host-header curl above.
