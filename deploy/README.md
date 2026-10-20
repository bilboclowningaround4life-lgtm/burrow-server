# Deployment helpers

`update.sh` fetches the configured branch, fast-forwards only, validates changed
JavaScript, and restarts the server only when a loaded server file changed. It
runs as root, but uses `BURROW_USER` for Git operations.

## systemd

The existing `burrow-update.service` and `burrow-update.timer` check for an
update every two minutes.

## OpenRC

The OpenRC service keeps a small foreground loop alive and runs the same
updater every two minutes. It does not require cron.

```sh
install -m 755 deploy/burrow-update.openrc /etc/init.d/burrow-update
install -m 644 deploy/burrow-update.conf /etc/conf.d/burrow-update
rc-update add burrow-update default
rc-service burrow-update start
```

Uncomment and change values in `/etc/conf.d/burrow-update` when the server is
not installed at `/home/aj/ajc-private-server`, runs as a different user, or
uses a differently named OpenRC service. `BURROW_UPDATE_INTERVAL` is a positive
number of seconds and defaults to `120`.

`update.sh` selects OpenRC automatically when run by OpenRC. Set
`BURROW_INIT=openrc` when running it manually or from another supervisor. Set
`BURROW_INIT=systemd` to force systemd.
