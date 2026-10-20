#!/usr/bin/env bash
# Takes the highscore service and its nginx part away again. Run as root on the server:
#   bash /root/xeno-scores-deploy/rollback.sh
# The site itself keeps working (its vhost is only loosened by one line). The secret (/etc/xeno), the table
# (/var/lib/xeno) and the user xeno are KEPT; the last lines print how to remove them too.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

echo "== nginx"
rm -f /etc/nginx/conf.d/xeno-scores.conf
sed -i '/include snippets\/xeno-api.conf;/d' /etc/nginx/sites-available/xeno
rm -f /etc/nginx/snippets/xeno-api.conf
nginx -t
systemctl reload nginx

echo "== service"
systemctl disable --now xeno-scores 2>/dev/null || true
rm -f /etc/systemd/system/xeno-scores.service /etc/cron.d/xeno-scores-backup
systemctl daemon-reload
rm -rf /opt/xeno-scores

echo "removed. kept: /etc/xeno (secret), /var/lib/xeno (the table and its backups), the user xeno."
echo "to remove those as well:  rm -rf /etc/xeno /var/lib/xeno; userdel xeno"
