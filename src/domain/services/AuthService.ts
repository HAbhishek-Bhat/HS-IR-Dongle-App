import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import type {AuthSession, UserProfile} from '../entities/types';
import {AppError} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

const AUTH_STORAGE_KEY = 'hs.auth.session.meta';
const PRIVACY_VERSION = '2026-10-01';

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  getAccessToken(): Promise<string | null>;
  acceptConsent(userId: string): Promise<UserProfile>;
  deleteMyData(): Promise<void>;
  getPrivacyVersion(): string;
}

/**
 * Local auth adapter.
 * Default: email/password validated locally; tokens stored in Keychain.
 * Swap implementation for real SSO/OIDC without changing UI.
 */
export class LocalAuthService implements AuthService {
  getPrivacyVersion(): string {
    return PRIVACY_VERSION;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@') || password.length < 8) {
      throw new AppError(
        'UNKNOWN',
        'Invalid credentials format',
        'Enter a valid email and a password of at least 8 characters.',
        false,
      );
    }

    const user: UserProfile = {
      id: String(uuid.v4()),
      email: normalized,
      displayName: normalized.split('@')[0] ?? null,
      consentAcceptedAt: null,
      privacyVersion: PRIVACY_VERSION,
    };

    const session: AuthSession = {
      accessToken: `local.${user.id}.${Date.now()}`,
      refreshToken: `refresh.${user.id}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      user,
    };

    await Keychain.setGenericPassword(normalized, JSON.stringify(session), {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      service: 'hs.ir.capture.auth',
    });
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({userId: user.id, email: normalized, consentAcceptedAt: null}),
    );
    logger.info('User signed in', {userId: user.id});
    return session;
  }

  async signOut(): Promise<void> {
    await Keychain.resetGenericPassword({service: 'hs.ir.capture.auth'});
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }

  async getSession(): Promise<AuthSession | null> {
    const creds = await Keychain.getGenericPassword({service: 'hs.ir.capture.auth'});
    if (!creds) {
      return null;
    }
    try {
      const session = JSON.parse(creds.password) as AuthSession;
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        throw new AppError('AUTH_EXPIRED', 'expired', 'Your session expired. Please sign in again.', true);
      }
      return session;
    } catch (error) {
      if (error instanceof AppError) {
        await this.signOut();
        throw error;
      }
      return null;
    }
  }

  async getAccessToken(): Promise<string | null> {
    try {
      const session = await this.getSession();
      return session?.accessToken ?? null;
    } catch {
      return null;
    }
  }

  async acceptConsent(userId: string): Promise<UserProfile> {
    const session = await this.getSession();
    if (!session || session.user.id !== userId) {
      throw new AppError('AUTH_EXPIRED', 'no session', 'Your session expired. Please sign in again.', true);
    }
    const updated: AuthSession = {
      ...session,
      user: {
        ...session.user,
        consentAcceptedAt: new Date().toISOString(),
        privacyVersion: PRIVACY_VERSION,
      },
    };
    await Keychain.setGenericPassword(session.user.email, JSON.stringify(updated), {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      service: 'hs.ir.capture.auth',
    });
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        userId,
        email: session.user.email,
        consentAcceptedAt: updated.user.consentAcceptedAt,
      }),
    );
    return updated.user;
  }

  async deleteMyData(): Promise<void> {
    // Caller must also wipe repositories and remote data.
    await this.signOut();
    logger.info('Local auth credentials cleared for delete-my-data');
  }
}
