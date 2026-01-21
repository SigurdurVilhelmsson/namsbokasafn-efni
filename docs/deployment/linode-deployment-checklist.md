# Linode Deployment Checklist

Deploying the translation workflow server to `ritstjorn.namsbokasafn.is`

## Prerequisites

- [ ] Linode server with Ubuntu 22.04+ (or similar)
- [ ] SSH access configured
- [ ] Domain DNS access for namsbokasafn.is

---

## 1. DNS Configuration

- [ ] Add A record: `ritstjorn.namsbokasafn.is` → Linode IP
- [ ] Wait for DNS propagation (check with `dig ritstjorn.namsbokasafn.is`)

---

## 2. Server Setup

```bash
# SSH to Linode
ssh root@<linode-ip>

# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install build essentials (for better-sqlite3)
apt install -y build-essential python3

# Install git
apt install -y git

# Create app user
useradd -m -s /bin/bash namsbokasafn
```

- [ ] System updated
- [ ] Node.js 20.x installed (`node --version`)
- [ ] Build tools installed
- [ ] Git installed
- [ ] App user created

---

## 3. SSL with Caddy (Recommended)

Caddy auto-provisions Let's Encrypt certificates.

```bash
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

Create `/etc/caddy/Caddyfile`:
```
ritstjorn.namsbokasafn.is {
    reverse_proxy localhost:3000
}
```

```bash
# Reload Caddy
systemctl reload caddy
```

- [ ] Caddy installed
- [ ] Caddyfile configured
- [ ] HTTPS working (after app is running)

---

## 4. GitHub OAuth App

Create at: https://github.com/settings/developers

| Field | Value |
|-------|-------|
| Application name | `Ritstjórn Námsbókasafns` |
| Homepage URL | `https://ritstjorn.namsbokasafn.is` |
| Authorization callback URL | `https://ritstjorn.namsbokasafn.is/api/auth/callback` |

- [ ] OAuth app created
- [ ] Client ID copied
- [ ] Client Secret copied

---

## 5. Clone Repository

```bash
# Switch to app user
su - namsbokasafn

# Clone repo
git clone https://github.com/SigurdurVilhelmsson/namsbokasafn-efni.git
cd namsbokasafn-efni/server

# Install dependencies
npm install
```

- [ ] Repo cloned
- [ ] Dependencies installed

---

## 6. Environment Configuration

Create `/home/namsbokasafn/namsbokasafn-efni/server/.env`:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# GitHub OAuth
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>
GITHUB_CALLBACK_URL=https://ritstjorn.namsbokasafn.is/api/auth/callback
GITHUB_ORG=namsbokasafn

# JWT Configuration
JWT_SECRET=<generate-with: openssl rand -hex 32>
JWT_EXPIRY=24h

# Admin Users (your GitHub username)
ADMIN_USERS=SigurdurVilhelmsson

# GitHub Repository
GITHUB_REPO_OWNER=SigurdurVilhelmsson
GITHUB_REPO_NAME=namsbokasafn-efni
GITHUB_BASE_BRANCH=main
```

Generate JWT secret:
```bash
openssl rand -hex 32
```

- [ ] .env file created
- [ ] GitHub OAuth credentials added
- [ ] JWT_SECRET generated
- [ ] ADMIN_USERS configured

---

## 7. Systemd Service

Create `/etc/systemd/system/ritstjorn.service` (as root):

```ini
[Unit]
Description=Ritstjorn Translation Workflow Server
After=network.target

[Service]
Type=simple
User=namsbokasafn
WorkingDirectory=/home/namsbokasafn/namsbokasafn-efni/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
systemctl daemon-reload
systemctl enable ritstjorn
systemctl start ritstjorn

# Check status
systemctl status ritstjorn
journalctl -u ritstjorn -f
```

- [ ] Service file created
- [ ] Service enabled
- [ ] Service started
- [ ] Logs look healthy

---

## 8. Verify Deployment

- [ ] Visit https://ritstjorn.namsbokasafn.is
- [ ] Login with GitHub works
- [ ] Can create workflow session
- [ ] Can upload files
- [ ] Files appear in `pipeline-output/sessions/`

---

## 9. Backup Strategy

The `pipeline-output/` directory contains:
- Session uploads
- SQLite database (sessions.db)
- Processed images

Options:
1. **Linode Backups** - Enable automatic Linode backups ($2/month)
2. **Rsync to external** - Cron job to sync to another location
3. **Git integration** - Move approved files to repo and commit

Recommended minimum:
```bash
# Add to crontab (as namsbokasafn user)
0 2 * * * tar -czf ~/backups/pipeline-output-$(date +\%Y\%m\%d).tar.gz ~/namsbokasafn-efni/pipeline-output/
```

- [ ] Backup strategy chosen
- [ ] Backup configured

---

## 10. Updates Workflow

To deploy updates:

```bash
# SSH to server
ssh namsbokasafn@<linode-ip>

cd ~/namsbokasafn-efni
git pull origin main
cd server
npm install  # if dependencies changed

# Restart service (as root)
sudo systemctl restart ritstjorn
```

- [ ] Update process documented/tested

---

## Security Checklist

- [ ] Firewall configured (UFW: allow 22, 80, 443 only)
- [ ] SSH key auth only (disable password auth)
- [ ] .env file has restrictive permissions (`chmod 600`)
- [ ] No TEST_MODE in production
- [ ] GitHub org membership restricts access

```bash
# UFW setup
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

---

## Post-Deployment

- [ ] Test full workflow: create session → upload MT → review
- [ ] Bookmark server URL
- [ ] Document any issues encountered
