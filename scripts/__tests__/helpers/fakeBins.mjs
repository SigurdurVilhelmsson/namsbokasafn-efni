import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RCLONE = `#!/usr/bin/env bash
# A stand-in for rclone in tests: logs each call; the "remote" is the directory $FAKE_REMOTE.
echo "$*" >> "$FAKE_LOG"
case "$1" in
  # As the real rclone: a directory is listed with a trailing "/", and --files-only leaves it out.
  lsf) [ -n "\${FAKE_FAIL_LSF:-}" ] && exit 1
    case " $* " in
      *" --files-only "*) ls -1p "$FAKE_REMOTE" | grep -v '/$' || true ;;
      *) ls -1p "$FAKE_REMOTE" ;;
    esac ;;
  copyto) [ -n "\${FAKE_FAIL_COPYTO:-}" ] && exit 1
    case "$2" in /*) cp -- "$2" "$FAKE_REMOTE/\${3#*:}" ;; *) cp -- "$FAKE_REMOTE/\${2#*:}" "$3" ;; esac ;;
  deletefile) [ -n "\${FAKE_FAIL_DELETE:-}" ] && exit 1; rm -f -- "$FAKE_REMOTE/\${2#*:}" ;;
  *) exit 9 ;;
esac
`;
const SQLITE3 = `#!/usr/bin/env bash
echo "sqlite3 $*" >> "$FAKE_LOG"
case "$2" in *integrity_check*) echo ok ;; *count*) echo 0 ;; *) exit 0 ;; esac
`;

export function makeFakeBins({ sqlite3 = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fake-bins-'));
  const binDir = path.join(root, 'bin');
  const remoteDir = path.join(root, 'remote');
  const log = path.join(root, 'calls.log');
  mkdirSync(binDir);
  mkdirSync(remoteDir);
  const put = (name, body) => {
    writeFileSync(path.join(binDir, name), body);
    chmodSync(path.join(binDir, name), 0o755);
  };
  put('rclone', RCLONE);
  if (sqlite3) put('sqlite3', SQLITE3);
  return {
    root,
    binDir,
    remoteDir,
    env: (over = {}) => ({ FAKE_LOG: log, FAKE_REMOTE: remoteDir, ...over }),
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}
