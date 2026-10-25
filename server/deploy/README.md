# Deploying the highscore service

The service (`server/`, built into `dist-server/`) runs on the game's server next to nginx and Arranger: its own user
`xeno`, a systemd unit modelled on `arranger-web.service`, its state in `/var/lib/xeno`, its secret in
`/etc/xeno/scores.env`, nginx proxying `/api/` of `xeno.kovalev.app` to `127.0.0.1:3002`.

What the server has (read on 2026-10-21): Ubuntu, node v24.21 at `/usr/local/bin/node` with `node:sqlite`, one core, 957 MB
of memory, nginx with certbot, no user `xeno`, nothing on port 3002.

## What touches what

| Where                                     | What                                                                    | By                                           |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| `/opt/xeno-scores/*.mjs`                  | the bundle                                                              | install.sh (root, read-only for the service) |
| `/etc/xeno/scores.env`                    | `SECRET`, `PORT`, `HOST`, made once, mode 0640 `root:xeno`, never shown | install.sh                                   |
| `/var/lib/xeno/`                          | `highscores.db`, `backup/`                                              | systemd (`StateDirectory`), owner `xeno`     |
| `/etc/systemd/system/xeno-scores.service` | the unit                                                                | install.sh                                   |
| `/etc/cron.d/xeno-scores-backup`          | a copy of the table every night at 03:17, two weeks kept                | install.sh                                   |
| `/etc/nginx/conf.d/xeno-scores.conf`      | the rate limit zones                                                    | install.sh                                   |
| `/etc/nginx/snippets/xeno-api.conf`       | `location /api/`                                                        | install.sh                                   |
| `/etc/nginx/sites-available/xeno`         | ONE added line: `include snippets/xeno-api.conf;`                       | install.sh                                   |

Not touched: Arranger (its units, user, `/var/lib/arranger`, its vhosts), other vhosts, the firewall, packages, the
site's files (that is the separate site deploy below).

**Line endings.** The scripts and units in this folder must reach the server with Unix line endings (`.gitattributes`
sets `eol=lf` for them). On Windows, check a checkout before uploading (`grep -c $'\r' server/deploy/install.sh` must
print 0); a script that arrives with CRLF fails in bash (`\r: command not found`) and a unit file with CRLF is not read
properly by systemd.

## Install (from the checkout that is on main, with ssh to `root@46.101.198.82`)

```bash
H=root@46.101.198.82

# 0. build the service and the site from the SAME checkout (a run carries a fingerprint of the simulation; the
#    service accepts only runs of its own build, so the site must be built from this commit too)
yarn build:server

# 1. read-only look first (nothing is written): expect "no such user", empty listings, no listener on 3002
ssh $H 'node -v; id xeno; ls /opt/xeno-scores /etc/xeno /var/lib/xeno; ss -ltn | grep -c ":3002 "; nginx -t'

# 2. upload to a scratch directory (nothing live changes yet)
ssh $H 'rm -rf /root/xeno-scores-deploy && mkdir -p /root/xeno-scores-deploy'
scp -r dist-server server/deploy/* $H:/root/xeno-scores-deploy/

# 3. install: backs up /etc/nginx first, checks `nginx -t` before the reload and puts everything back if it fails
ssh $H 'bash /root/xeno-scores-deploy/install.sh'
```

## Smoke test (a real recorded game against the live service)

```bash
node dist-server/smoke.mjs https://xeno.kovalev.app          # all lines must say "ok"; it makes five submissions
# it leaves ONE entry, "smoke test": take it out again
ssh $H 'runuser -u xeno -- env DB_PATH=/var/lib/xeno/highscores.db /usr/local/bin/node --disable-warning=ExperimentalWarning /opt/xeno-scores/admin.mjs remove-nick "smoke test"'
ssh $H 'journalctl -u xeno-scores -n 30 --no-pager'           # JSON lines, addresses only as hashes
```

The smoke test checks: health and the same simulation build as this checkout; the table can be read and a bad
map is refused; a real game is accepted and its result is the server's; the game is in the table; the same token twice is
refused; a tampered run is refused; a run of another build is refused; a forged token is refused.

## Update (a new build of the game)

Build both from the new commit (`yarn build:server`, `yarn build`), upload `dist-server` as in step 2, run `install.sh`
again (it keeps the secret and the table, replaces the bundle, restarts the service). Then deploy the site. Between the
two a player with an old page gets "update the game" (409) instead of a wrong result. The table is kept; entries made on an
older build stay (their runs are kept compressed in the database, so they can be checked again).

## Roll back

```bash
ssh $H 'bash /root/xeno-scores-deploy/rollback.sh'
```

Removes the nginx part (the one line, the two files), stops and removes the unit, the cron file and `/opt/xeno-scores`; the
site keeps working. The secret, the table and the user stay; the last lines of the script say how to remove them. The
nginx backup made by `install.sh` is in `/root/nginx-backup-<time>` if anything needs comparing.

## Everyday

- Logs: `journalctl -u xeno-scores -f`. Status: `systemctl status xeno-scores`.
- Moderation (as the user xeno, with `DB_PATH=/var/lib/xeno/highscores.db`): `admin.mjs top <level> <diff> [n]`,
  `remove <id>`, `remove-nick <nick>`, `backup <file>`.
- Limits: nginx 60 reads, 20 submissions and 90 result polls a minute per address (`nginx-xeno-limits.conf`); the service twenty submissions and
  120 seeds an hour per address, a body of 256 KB, a replay of at most 90 s of CPU, three replays waiting or running at most (`server/limits.ts`).
- A replay of a 100-wave game takes about 7 s on this server (192 000 ticks in 6.6 s measured with the real bot game). A late
  game is far heavier: 70 upgraded towers on Crossroads took 56 s at the natural pace to the 90-minute limit and 77 s with the
  waves called at once, so a replay may use the core for up to 90 s. That is why the unit has `Nice=10` and `CPUWeight=50`:
  nginx and Arranger must not be starved meanwhile.
