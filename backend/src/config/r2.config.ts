import { registerAs } from '@nestjs/config';

/**
 * Object storage, spoken as S3 — which is what AWS S3, Cloudflare R2 and MinIO
 * all speak, so one client covers them.
 *
 * The only thing that differs between them is where requests go. AWS derives
 * its endpoint from the region and must not be given one explicitly; R2 has a
 * single account-scoped host and calls its region `auto`. This used to be
 * hardcoded to the R2 form, so AWS credentials were signed correctly and then
 * sent to Cloudflare.
 *
 * `S3_*` is the provider-neutral spelling. The older `R2_*` names still work,
 * so an existing deployment keeps running untouched — and `R2_ACCOUNT_ID`
 * alone is enough to reconstruct the Cloudflare endpoint, which is how R2
 * setups stay a three-variable affair.
 */
const value = (...names: string[]) =>
  names.map((name) => process.env[name]).find((entry) => entry) || undefined;

export default registerAs('storage', () => {
  const accountId = value('R2_ACCOUNT_ID');
  const explicitEndpoint = value('S3_ENDPOINT');

  return {
    accessKeyId: value('S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'),
    secretAccessKey: value('S3_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'),
    bucketName: value('S3_BUCKET', 'R2_BUCKET_NAME') || 'upz-pushes',
    publicUrl: value('S3_PUBLIC_URL', 'R2_PUBLIC_URL'),
    /**
     * Left undefined for AWS, which is what makes the SDK resolve
     * `<bucket>.s3.<region>.amazonaws.com` itself. R2 keeps its explicit host.
     */
    endpoint:
      explicitEndpoint ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
    /** R2 ignores the region but requires one; AWS routes by it. */
    region:
      value('S3_REGION', 'AWS_REGION') || (accountId ? 'auto' : undefined),
  };
});
