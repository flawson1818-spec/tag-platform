import { UserResponseDto } from '../../users/user-response.dto';

export interface AuthResponseDto {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  user: UserResponseDto;
}
