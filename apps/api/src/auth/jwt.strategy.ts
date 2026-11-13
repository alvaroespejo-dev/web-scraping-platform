import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@scraping/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppEnv, ENV_TOKEN } from '../config/env';

interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ENV_TOKEN) env: AppEnv) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.jwtAccessSecret,
    });
  }

  validate(payload: AccessPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
