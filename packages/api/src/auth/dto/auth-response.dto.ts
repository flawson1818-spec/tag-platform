import { UserResponseDto } from '../../users/user-response.dto';

export interface AuthResponseDto {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  user: UserResponseDto;
  /** Only present when the caller just opted into "remember this device" during an MFA challenge. */
  device_token?: string;
}
