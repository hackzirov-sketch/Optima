#!/bin/sh
#
# coturn launcher.
#
# The auth mode is chosen here rather than hard-coded into docker-compose's
# `command`, because it has to agree with whatever MeetingsService.getIceServers
# hands the browser. That method prefers TURN_SECRET (coturn's `use-auth-secret`
# / TURN REST API mode) and only falls back to the static TURN_USERNAME /
# TURN_CREDENTIAL pair. A compose file pinned to `--user` therefore rejected
# every credential the API issued the moment TURN_SECRET was set: allocations
# came back 401, no relay candidate was ever gathered, and calls between two
# NATed participants had no path for media — while the same build worked
# locally, where host candidates connect directly and TURN is never consulted.
#
set -eu

set -- \
  -n \
  --log-file=stdout \
  --listening-port="${TURN_LISTENING_PORT:-3478}" \
  --min-port="${TURN_MIN_PORT:-49160}" \
  --max-port="${TURN_MAX_PORT:-49200}" \
  --realm="${TURN_REALM:-upz.local}" \
  --no-cli \
  --fingerprint

if [ -n "${TURN_SECRET:-}" ]; then
  set -- "$@" --use-auth-secret --static-auth-secret="$TURN_SECRET"
elif [ -n "${TURN_USERNAME:-}" ] && [ -n "${TURN_CREDENTIAL:-}" ]; then
  # Long-term credential mechanism. Mutually exclusive with the above.
  set -- "$@" --lt-cred-mech --user="$TURN_USERNAME:$TURN_CREDENTIAL"
else
  echo "coturn: set TURN_SECRET (preferred), or TURN_USERNAME and TURN_CREDENTIAL" >&2
  exit 1
fi

# Behind a NAT (a cloud VM with a 1:1 mapped public address, most hosts) coturn
# only sees its private address and advertises that in its srflx/relay
# candidates — which is useless to a peer on the internet. TURN_EXTERNAL_IP is
# the public address, and it must be an IP: coturn does not resolve names here.
if [ -n "${TURN_EXTERNAL_IP:-}" ]; then
  set -- "$@" --external-ip="$TURN_EXTERNAL_IP"
fi

# TLS on 443 is the fallback that gets through networks where outbound UDP (and
# often anything but 443) is blocked — exactly the corporate and mobile networks
# where a relay is needed most. Enabled only when a certificate is mounted.
if [ -n "${TURN_TLS_CERT:-}" ] && [ -n "${TURN_TLS_KEY:-}" ]; then
  set -- "$@" \
    --tls-listening-port="${TURN_TLS_PORT:-5349}" \
    --cert="$TURN_TLS_CERT" \
    --pkey="$TURN_TLS_KEY"
else
  set -- "$@" --no-tls --no-dtls
fi

exec turnserver "$@"
