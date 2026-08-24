import { User } from './user.entity';

export type UserResponseDto = Omit<User, 'password_hash'>;

export function toUserResponse(user: User): UserResponseDto {
  const rest: Partial<User> = { ...user };
  delete rest.password_hash;
  return rest as UserResponseDto;
}
