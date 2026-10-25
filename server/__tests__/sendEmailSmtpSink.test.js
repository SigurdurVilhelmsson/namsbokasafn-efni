// server/__tests__/sendEmailSmtpSink.test.js
//
// Drives the REAL sendEmail() through nodemailer into a minimal local SMTP
// sink, so a nodemailer bump is validated by CI instead of only installed.
//
// Before this file no test reached sendEmail: its require('nodemailer') is
// lazy and sits behind isEmailConfigured(), and no workflow sets SMTP_*. So a
// green suite on a nodemailer major proved nothing (CLAUDE.md, npm advisories;
// register §C197, where 9 → 10 was forced and validated by hand against this
// same sink). The two controls below are what make a pass mean something: a
// sink that rejects the recipient must turn the result false, and an
// unconfigured transport must never open a connection.
//
// The sink can announce PIPELINING (2026-10-24, with nodemailer 10.0.13 → 10.2.1):
// from 10.1.0 nodemailer sends MAIL, RCPT and DATA in one batch when a server
// announces it, as real submission servers do, so the sink checks both paths.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import net from 'net';
const require = createRequire(import.meta.url);
const { sendEmail } = require('../services/notifications');

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE'];

// Each reply is held this long, so a client that sends its next command without waiting for
// the reply (PIPELINING) is seen doing so, however TCP happens to split or merge the writes.
const REPLY_DELAY_MS = 5;

/**
 * Minimal SMTP server: EHLO (AUTH PLAIN, no STARTTLS), AUTH, MAIL, RCPT, DATA, QUIT.
 *
 * `pipelining` announces PIPELINING, as a real submission server does; nodemailer 10.1.0 and
 * later then send MAIL, RCPT and DATA in one batch. `seen.overlapped` counts envelope commands
 * that arrived while a reply was still owed: never for a client that waits, always for one that
 * pipelines. DATA after no accepted recipient is refused with 554 (RFC 2920), not opened.
 * @param {{ rejectRcpt?: boolean, pipelining?: boolean }} opts
 * @returns {Promise<{ port: number, seen: object, close: () => Promise<void> }>}
 */
function startSink({ rejectRcpt = false, pipelining = false } = {}) {
  const seen = {
    connections: 0,
    auth: null,
    mailFrom: null,
    rcpt: [],
    data: null,
    overlapped: 0,
  };
  const server = net.createServer((sock) => {
    seen.connections += 1;
    let buf = '';
    let inData = false;
    let accepted = 0;
    let owed = 0;
    const reply = (text, end = false) => {
      owed += 1;
      setTimeout(() => {
        owed -= 1;
        if (!sock.writable) return;
        if (end) sock.end(text);
        else sock.write(text);
      }, REPLY_DELAY_MS);
    };
    // A client that resets the connection must not crash the run with an unhandled error.
    sock.on('error', () => {});
    sock.write('220 sink ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (inData) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end === -1) return;
        seen.data = buf.slice(0, end);
        buf = buf.slice(end + 5);
        inData = false;
        reply('250 OK queued\r\n');
      }
      let i;
      while (!inData && (i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const cmd = line.toUpperCase();
        if (/^(MAIL FROM|RCPT TO|DATA$)/.test(cmd) && owed > 0) seen.overlapped += 1;
        if (cmd.startsWith('EHLO')) {
          const ext = pipelining ? '250-PIPELINING\r\n' : '';
          reply(`250-sink\r\n${ext}250-AUTH PLAIN\r\n250 8BITMIME\r\n`);
        } else if (cmd.startsWith('AUTH PLAIN')) {
          seen.auth = Buffer.from(line.split(' ')[2] || '', 'base64')
            .toString('utf8')
            .split('\0');
          reply('235 Authentication successful\r\n');
        } else if (cmd.startsWith('MAIL FROM')) {
          seen.mailFrom = line;
          reply('250 OK\r\n');
        } else if (cmd.startsWith('RCPT TO')) {
          seen.rcpt.push(line);
          if (!rejectRcpt) accepted += 1;
          reply(rejectRcpt ? '550 no such user\r\n' : '250 OK\r\n');
        } else if (cmd === 'DATA') {
          if (accepted === 0) reply('554 no valid recipients\r\n');
          else {
            inData = true;
            reply('354 go ahead\r\n');
          }
        } else if (cmd === 'QUIT') reply('221 bye\r\n', true);
        else if (cmd === 'RSET') {
          accepted = 0;
          reply('250 OK\r\n');
        } else if (cmd === 'NOOP') reply('250 OK\r\n');
        else reply('502 unknown\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        seen,
        close: () => new Promise((r) => server.close(() => r())),
      })
    );
  });
}

let savedEnv;
function configureSmtp(port) {
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: 'sink-user',
    SMTP_PASS: 'sink-pass',
    SMTP_FROM: 'from@example.test',
  });
  delete process.env.SMTP_SECURE;
}
beforeAll(() => {
  savedEnv = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('sendEmail through a local SMTP sink', () => {
  let sink;
  let result;
  beforeAll(async () => {
    sink = await startSink();
    configureSmtp(sink.port);
    result = await sendEmail(
      'to@example.test',
      'Sink subject 42',
      '<p>html body 42</p>',
      'text body 42'
    );
  });
  afterAll(() => sink.close());

  it('reports the message as sent', () => {
    expect(result).toBe(true);
  });

  it('authenticates with SMTP_USER and SMTP_PASS', () => {
    expect(sink.seen.auth?.slice(1)).toEqual(['sink-user', 'sink-pass']);
  });

  it('uses SMTP_FROM as the envelope sender', () => {
    expect(sink.seen.mailFrom).toBe('MAIL FROM:<from@example.test>');
  });

  it('addresses exactly the one recipient', () => {
    expect(sink.seen.rcpt).toEqual(['RCPT TO:<to@example.test>']);
  });

  it('carries the subject as a header value', () => {
    expect(sink.seen.data).toMatch(/^Subject: Sink subject 42$/m);
  });

  it('carries the text body', () => {
    expect(sink.seen.data).toContain('text body 42');
  });

  it('carries the html body', () => {
    expect(sink.seen.data).toContain('<p>html body 42</p>');
  });

  it('waited for each reply, since this sink announces no PIPELINING (the control below)', () => {
    expect(sink.seen.overlapped).toBe(0);
  });
});

// A real submission server announces PIPELINING, and from 10.1.0 nodemailer then sends the
// envelope in one batch: a different path from the one above, and the one production would take.
describe('sendEmail through a sink that announces PIPELINING', () => {
  let sink;
  let result;
  beforeAll(async () => {
    sink = await startSink({ pipelining: true });
    configureSmtp(sink.port);
    result = await sendEmail('to@example.test', 'Pipelined 7', '<p>html 7</p>', 'text 7');
  });
  afterAll(() => sink.close());

  it('reports the message as sent', () => {
    expect(result).toBe(true);
  });

  it('sent the envelope without waiting for each reply: the pipelined path ran', () => {
    expect(sink.seen.overlapped).toBeGreaterThan(0);
  });

  it('addresses the one recipient and carries the subject and text', () => {
    const data = sink.seen.data ?? '';
    expect([sink.seen.rcpt, /^Subject: Pipelined 7$/m.test(data), data.includes('text 7')]).toEqual(
      [['RCPT TO:<to@example.test>'], true, true]
    );
  });

  it('returns false when the server rejects the recipient in the batch', async () => {
    const rejecting = await startSink({ pipelining: true, rejectRcpt: true });
    configureSmtp(rejecting.port);
    try {
      const sent = await sendEmail('to@example.test', 's', '<p>h</p>', 't');
      // overlapped > 0: the refusal came back on the pipelined path, not the old one.
      expect([sent, rejecting.seen.overlapped > 0]).toEqual([false, true]);
    } finally {
      await rejecting.close();
    }
  });
});

describe('sendEmail controls', () => {
  it('returns false when the server rejects the recipient', async () => {
    const sink = await startSink({ rejectRcpt: true });
    configureSmtp(sink.port);
    try {
      expect(await sendEmail('to@example.test', 's', '<p>h</p>', 't')).toBe(false);
    } finally {
      await sink.close();
    }
  });

  it('never connects when SMTP is not configured', async () => {
    const sink = await startSink();
    configureSmtp(sink.port);
    delete process.env.SMTP_HOST;
    try {
      await sendEmail('to@example.test', 's', '<p>h</p>', 't');
      expect(sink.seen.connections).toBe(0);
    } finally {
      await sink.close();
    }
  });
});
