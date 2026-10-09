import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { E2EE_MAX_CIPHERTEXT_LENGTH } from '../e2ee/e2ee.util';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** ECDH P-256 public key as a JWK. Private members (`d`) are rejected by whitelist + the service. */
export class EcPublicJwkDto {
  @IsIn(['EC'])
  kty: 'EC';

  @IsIn(['P-256'])
  crv: 'P-256';

  @IsString()
  @MaxLength(64)
  x: string;

  @IsString()
  @MaxLength(64)
  y: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Client-generated device id' })
  @Matches(DEVICE_ID_PATTERN)
  deviceId: string;

  @ApiProperty({ description: 'ECDH P-256 public key (JWK)' })
  @IsObject()
  @ValidateNested()
  @Type(() => EcPublicJwkDto)
  publicKey: EcPublicJwkDto;
}

export class E2eeEnvelopeDto {
  @IsIn([1, 2])
  v: 1 | 2;

  @IsInt()
  @Min(1)
  epoch: number;

  @Matches(DEVICE_ID_PATTERN)
  device: string;

  @IsBase64()
  @MaxLength(32)
  iv: string;

  @IsBase64()
  @IsNotEmpty()
  @MaxLength(E2EE_MAX_CIPHERTEXT_LENGTH)
  ct: string;
}

export class WrappedRoomKeyDto {
  @IsUUID()
  userId: string;

  @Matches(DEVICE_ID_PATTERN)
  deviceId: string;

  @IsBase64()
  @MaxLength(128)
  wrappedKey: string;

  @IsBase64()
  @MaxLength(32)
  iv: string;
}

export class SharedRoomKeyDto extends WrappedRoomKeyDto {
  @IsInt()
  @Min(1)
  epoch: number;
}

export class ShareRoomKeysDto {
  @ApiProperty({
    description: 'Device doing the re-wrapping (must hold the keys)',
  })
  @Matches(DEVICE_ID_PATTERN)
  deviceId: string;

  @ApiProperty({ type: [SharedRoomKeyDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SharedRoomKeyDto)
  keys: SharedRoomKeyDto[];
}

export class CreateRoomKeyEpochDto {
  @ApiProperty({ description: 'Device that generated and wrapped the key' })
  @Matches(DEVICE_ID_PATTERN)
  deviceId: string;

  @ApiProperty({ description: 'Must be the room’s current epoch + 1' })
  @IsInt()
  @Min(1)
  epoch: number;

  @ApiProperty({ type: [WrappedRoomKeyDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WrappedRoomKeyDto)
  keys: WrappedRoomKeyDto[];
}
