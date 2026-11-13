import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { AppEnv, ENV_TOKEN } from '../config/env';
import { UsersService } from '../users/users.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(ENV_TOKEN) private readonly env: AppEnv,
  ) {}

  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    const user = await this.users.create({
      email: email.toLowerCase(),
      passwordHash: await argon2.hash(password),
      role: 'USER',
    });
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.env.jwtRefreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user?.refreshHash || user.refreshHash !== sha256(refreshToken)) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.users.setRefreshHash(userId, null);
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, email: user.email },
      { secret: this.env.jwtAccessSecret, expiresIn: this.env.jwtAccessTtl as never },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      { secret: this.env.jwtRefreshSecret, expiresIn: this.env.jwtRefreshTtl as never },
    );
    await this.users.setRefreshHash(user.id, sha256(refreshToken));
    return { accessToken, refreshToken };
  }
}
