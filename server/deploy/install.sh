#!/usr/bin/env bash
# Installs or updates the highscore service on the server. Run as root, from the uploaded directory (see README.md):
#   bash /root/xeno-scores-deploy/install.sh
# It touches only: the user xeno, /opt/xeno-scores, /etc/xeno, /var/lib/xeno (made by systemd), the unit
# xeno-scores.service, the nginx files xeno-scores.conf (conf.d) and xeno-api.conf (snippets), and ONE line in the
# xeno.kovalev.app vhost. Not Arranger, not other vhosts, not the firewall, not packages.
# Safe to run again: it updates the bundle and restarts the service, and keeps the secret and the table.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
VHOST=/etc/nginx/sites-available/xeno
NODE=/usr/local/bin/node

say() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
[ -d "$SRC/dist-server" ] || { echo "no dist-server/ next to this script"; exit 1; }
[ -f "$VHOST" ] || { echo "no $VHOST"; exit 1; }
"$NODE" -e 'require("node:sqlite")' 2>/dev/null || { echo "this node has no node:sqlite"; exit 1; }

say "backup of /etc/nginx -> /root/nginx-backup-$STAMP"
cp -a /etc/nginx "/root/nginx-backup-$STAMP"

say "user, directories, secret"
id xeno >/dev/null 2>&1 || useradd --system --home-dir /var/lib/xeno --shell /usr/sbin/nologin --no-create-home xeno
install -d -m 0755 -o root -g root /opt/xeno-scores
install -d -m 0750 -o root -g xeno /etc/xeno
if [ ! -f /etc/xeno/scores.env ]; then
  (umask 077; printf 'SECRET=%s\nPORT=3002\nHOST=127.0.0.1\n' "$(head -c 48 /dev/urandom | base64 -w0 | tr -d '/+=')" > /etc/xeno/scores.env)
  chown root:xeno /etc/xeno/scores.env
  chmod 0640 /etc/xeno/scores.env
  echo "new secret written to /etc/xeno/scores.env (not shown)"
else
  echo "keeping the existing /etc/xeno/scores.env"
fi

say "the service"
install -m 0644 -o root -g root "$SRC"/dist-server/*.mjs /opt/xeno-scores/
install -m 0644 -o root -g root "$SRC/xeno-scores.service" /etc/systemd/system/xeno-scores.service
systemctl daemon-reload
systemctl enable xeno-scores >/dev/null 2>&1
systemctl restart xeno-scores
ok=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3002/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  journalctl -u xeno-scores -n 30 --no-pager || true
  echo "the service did not come up: nothing of nginx was touched; roll back with rollback.sh"
  exit 1
fi
curl -fsS http://127.0.0.1:3002/api/health
echo

say "backups of the table (a copy every night, kept two weeks)"
install -d -m 0750 -o xeno -g xeno /var/lib/xeno/backup
cat > /etc/cron.d/xeno-scores-backup <<'CRON'
# a consistent copy of the highscore table every night; copies older than 14 days are removed
17 3 * * * xeno DB_PATH=/var/lib/xeno/highscores.db /usr/local/bin/node --disable-warning=ExperimentalWarning /opt/xeno-scores/admin.mjs backup /var/lib/xeno/backup/highscores-$(date +\%F).db >/dev/null 2>&1; find /var/lib/xeno/backup -name 'highscores-*.db' -mtime +14 -delete
CRON
chmod 0644 /etc/cron.d/xeno-scores-backup

say "nginx"
install -m 0644 "$SRC/nginx-xeno-limits.conf" /etc/nginx/conf.d/xeno-scores.conf
install -d -m 0755 /etc/nginx/snippets
install -m 0644 "$SRC/nginx-xeno-api.conf" /etc/nginx/snippets/xeno-api.conf
if ! grep -q 'snippets/xeno-api.conf' "$VHOST"; then
  # the include goes right after the line that serves the site, which must be there exactly once
  [ "$(grep -c 'location / { try_files \$uri \$uri/ =404; }' "$VHOST")" = 1 ] || { echo "the vhost is not what this script expects"; exit 1; }
  sed -i 's|^\([[:space:]]*location / { try_files \$uri \$uri/ =404; }\)$|\1\n\tinclude snippets/xeno-api.conf;|' "$VHOST"
fi
if ! nginx -t; then
  echo "nginx -t failed: putting the vhost back and removing the new nginx files"
  cp -a "/root/nginx-backup-$STAMP/sites-available/xeno" "$VHOST"
  rm -f /etc/nginx/conf.d/xeno-scores.conf /etc/nginx/snippets/xeno-api.conf
  nginx -t
  exit 1
fi
systemctl reload nginx

say "through nginx"
# right after the reload the old workers may still answer (404 for /api/): look again for a few seconds. This is
# information, not a gate: the install is done, and a failure here must not make the script look as if it was not.
via=0
for _ in $(seq 1 10); do
  if out="$(curl -fsS --max-time 5 --resolve xeno.kovalev.app:443:127.0.0.1 https://xeno.kovalev.app/api/health 2>/dev/null)"; then
    echo "$out"
    via=1
    break
  fi
  sleep 1
done
if [ "$via" != 1 ]; then
  echo "NOTE: /api/health did not answer through nginx within 10 s; check by hand:"
  echo "  curl -s https://xeno.kovalev.app/api/health   and   nginx -t   and   journalctl -u xeno-scores -n 30"
fi
say "done. nginx backup: /root/nginx-backup-$STAMP"
