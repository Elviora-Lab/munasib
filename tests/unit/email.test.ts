import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
const resendCtorMock = vi.hoisted(() =>
  vi.fn(function ResendMock() {
    return {
      emails: {
        send: sendMock,
      },
    };
  }),
);

vi.mock('resend', () => ({
  Resend: resendCtorMock,
}));

async function loadEmailModule(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_ENVIRONMENT = 'development';
  process.env.NEXT_PUBLIC_SITE_NAME = 'Munasib';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  setOptionalEnv('RESEND_API_KEY', env.RESEND_API_KEY);
  setOptionalEnv('EMAIL_FROM', env.EMAIL_FROM);
  setOptionalEnv('EMAIL_REPLY_TO', env.EMAIL_REPLY_TO);
  return import('@/server/email/resend');
}

function setOptionalEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe('sendEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    resendCtorMock.mockClear();
  });

  it('logs locally and does not call Resend when no API key is configured', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendEmail, isEmailConfigured } = await loadEmailModule();

    await expect(
      sendEmail({
        to: 'customer@example.com',
        subject: 'Order received',
        html: '<p>Thanks</p>',
      }),
    ).resolves.toEqual({ id: null });

    expect(isEmailConfigured()).toBe(false);
    expect(resendCtorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[email:dev]',
      'Order received',
      '\u2192',
      'customer@example.com',
    );
    log.mockRestore();
  });

  it('sends with the default Munasib sender when Resend is configured', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_123' } });
    const { sendEmail, isEmailConfigured } = await loadEmailModule({
      RESEND_API_KEY: 're_test_123',
    });

    await expect(
      sendEmail({
        to: 'customer@example.com',
        subject: 'Your Munasib order',
        html: '<p>Thanks</p>',
        text: 'Thanks',
      }),
    ).resolves.toEqual({ id: 'email_123' });

    expect(isEmailConfigured()).toBe(true);
    expect(resendCtorMock).toHaveBeenCalledWith('re_test_123');
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Munasib <munasibpk12@gmail.com>',
      to: 'customer@example.com',
      subject: 'Your Munasib order',
      html: '<p>Thanks</p>',
      text: 'Thanks',
      replyTo: undefined,
    });
  });

  it('uses configured sender and reply-to addresses', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_456' } });
    const { sendEmail } = await loadEmailModule({
      RESEND_API_KEY: 're_test_456',
      EMAIL_FROM: 'Munasib Orders <orders@munasib.pk>',
      EMAIL_REPLY_TO: 'support@munasib.pk',
    });

    await sendEmail({
      to: ['one@example.com', 'two@example.com'],
      subject: 'Order received',
      html: '<p>Thanks</p>',
    });

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Munasib Orders <orders@munasib.pk>',
      to: ['one@example.com', 'two@example.com'],
      subject: 'Order received',
      html: '<p>Thanks</p>',
      text: undefined,
      replyTo: 'support@munasib.pk',
    });
  });

  it('surfaces Resend API errors in development', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 403, message: 'The gmail.com domain is not verified' },
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendEmail } = await loadEmailModule({ RESEND_API_KEY: 're_test_123' });

    await expect(
      sendEmail({ to: 'customer@example.com', subject: 'Test', html: '<p>x</p>' }),
    ).rejects.toThrow('The gmail.com domain is not verified');

    errorLog.mockRestore();
  });
});
