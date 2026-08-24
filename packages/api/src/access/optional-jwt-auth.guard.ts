import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

/** Attaches req.user when a valid bearer token is present; never blocks the request otherwise. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthenticatedUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user ? user : undefined;
  }
}
