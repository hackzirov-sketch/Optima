import { normalizeSmtpPassword, smtpConfigProblems } from './mail.service';

describe('SMTP config', () => {
  it('strips the spaces and quotes app passwords are often pasted with', () => {
    expect(normalizeSmtpPassword('abcd efgh ijkl mnop')).toBe(
      'abcdefghijklmnop',
    );
    expect(normalizeSmtpPassword('"abcd efgh ijkl mnop"')).toBe(
      'abcdefghijklmnop',
    );
    expect(normalizeSmtpPassword(' SG.key\n')).toBe('SG.key');
    expect(normalizeSmtpPassword(undefined)).toBe('');
  });

  it('flags a Gmail app password sent to SendGrid', () => {
    const problems = smtpConfigProblems(
      'smtp.sendgrid.net',
      'apikey',
      'abcdefghijklmnop',
    );
    expect(problems.join(' ')).toMatch(/Gmail app password/);
  });

  it('accepts a correct Gmail setup', () => {
    expect(
      smtpConfigProblems('smtp.gmail.com', 'me@gmail.com', 'abcdefghijklmnop'),
    ).toEqual([]);
  });

  it('accepts a correct SendGrid setup', () => {
    expect(
      smtpConfigProblems(
        'smtp.sendgrid.net',
        'apikey',
        'SG.xxx.yyy',
        'noreply@upz.dev',
      ),
    ).toEqual([]);
  });

  it('flags a Gmail login without a full address', () => {
    expect(
      smtpConfigProblems('smtp.gmail.com', 'apikey', 'abcdefghijklmnop'),
    ).toHaveLength(1);
  });
});
