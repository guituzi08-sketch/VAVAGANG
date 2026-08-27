# TURN server

This directory runs a real Coturn relay for WebRTC. It is intended for a Linux VPS with a public IPv4 address.

## Deploy

1. Copy `.env.example` to `.env`.
2. Set `TURN_EXTERNAL_IP` to the VPS public IPv4 address.
3. Set `TURN_REALM` to the DNS name used by the relay.
4. Generate a strong `TURN_PASSWORD` and keep `.env` private.
5. Open these firewall ports on the VPS:

```text
3478/udp
3478/tcp
49152-65535/udp
```

6. Start Coturn:

```sh
docker compose --env-file .env up -d
```

7. Check the service:

```sh
docker logs --follow vavagang-coturn
```

The frontend must use the same host and credentials through its private Vite environment:

```text
VITE_TURN_URL=turn:turn.vavagang.example:3478?transport=udp
VITE_TURN_USERNAME=vavagang
VITE_TURN_CREDENTIAL=the-same-turn-password
```

For TCP fallback, set `VITE_TURN_URL` to `turn:turn.vavagang.example:3478?transport=tcp`, or update the frontend to accept a comma-separated list of TURN URLs. Do not commit either `.env` file or the credential.

This container is not publicly reachable from the development container until deployed to a VPS or another host with a public address and firewall access.
