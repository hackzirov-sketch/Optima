import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { StorageService } from './storage.service';
import { ErrorCode } from '../../common/enums/error-code.enum';

/**
 * A DNS failure reaching Cloudinary (`getaddrinfo EAI_AGAIN`) used to escape as
 * a raw Error: the global filter logged "Unhandled Exception" with a stack
 * trace and returned an opaque 500, so an outage at the image host was
 * indistinguishable from a broken backend. Worse, verifyUploadedAsset caught
 * *everything* and reported it as "asset not found" — telling the user to
 * re-upload a file that was already stored fine.
 */
describe('StorageService — Cloudinary transport failures', () => {
  let service: StorageService;

  const dnsError = () =>
    Object.assign(new Error('getaddrinfo EAI_AGAIN api.cloudinary.com'), {
      code: 'EAI_AGAIN',
    });

  beforeEach(() => {
    const config = {
      get: (key: string) =>
        ({
          'storage.bucketName': 'bucket',
          'storage.publicUrl': 'https://cdn.example',
          'storage.region': 'eu-central-1',
          'storage.accessKeyId': 'key',
          'storage.secretAccessKey': 'secret',
          'cloudinary.cloudName': 'cloud',
          'cloudinary.apiKey': 'api-key',
          'cloudinary.apiSecret': 'api-secret',
          'cloudinary.folder': 'upz',
        })[key],
    } as unknown as ConfigService;

    service = new StorageService(config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports an unreachable host as 503, not as a missing asset', async () => {
    jest.spyOn(cloudinary.api, 'resource').mockRejectedValue(dnsError());

    await expect(
      service.verifyUploadedAsset('upz/avatars/x', 'avatars'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('retries once before giving up — a resolver blip is not an outage', async () => {
    const resource = jest
      .spyOn(cloudinary.api, 'resource')
      .mockRejectedValueOnce(dnsError())
      .mockResolvedValue({
        bytes: 1024,
        format: 'png',
        secure_url: 'https://res/x.png',
      });

    const result = await service.verifyUploadedAsset(
      'upz/avatars/x',
      'avatars',
    );

    expect(resource).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      bytes: 1024,
      format: 'png',
      secureUrl: 'https://res/x.png',
    });
  });

  it('still reports a genuine 404 from Cloudinary as a missing asset', async () => {
    // Cloudinary answered — it just doesn't have the asset. Nothing transient
    // about that, and retrying would only delay the real error.
    jest
      .spyOn(cloudinary.api, 'resource')
      .mockRejectedValue(
        Object.assign(new Error('Resource not found'), { http_code: 404 }),
      );

    await expect(
      service.verifyUploadedAsset('upz/avatars/x', 'avatars'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.STORAGE_ASSET_NOT_FOUND },
    });
  });

  it('rejects an oversized upload without retrying', async () => {
    jest.spyOn(cloudinary.api, 'resource').mockResolvedValue({
      bytes: 50 * 1024 * 1024,
      format: 'png',
      secure_url: 'u',
    });
    const destroy = jest
      .spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValue({ result: 'ok' });

    await expect(
      service.verifyUploadedAsset('upz/avatars/x', 'avatars'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The rejected file must not be left burning storage in the account.
    expect(destroy).toHaveBeenCalledWith('upz/avatars/x');
  });

  it('never lets a delete failure surface — cleanup is best-effort', async () => {
    jest.spyOn(cloudinary.uploader, 'destroy').mockRejectedValue(dnsError());

    await expect(
      service.deleteCloudinaryFile('upz/avatars/x'),
    ).resolves.toBeUndefined();
  });
});
