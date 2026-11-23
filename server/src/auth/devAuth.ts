/**
 * Server-Side Local Development Authentication & RBAC Middleware
 * (resources/lectures_merged.pdf pp. 35, 225, 230)
 *
 * Security invariants:
 * - Authoritative actorId, role, and deviceId are derived strictly from credentials,
 *   NEVER from request body fields.
 * - Raw tokens are never written to logs or error responses.
 * - Roles:
 *   - 'viewer': read-only GET access (balance, night-flow, incidents, audit)
 *   - 'dispatcher': read + operational assessments, incident transitions, allocation, savings
 *   - 'device': restricted strictly to POST /v1/telemetry/batch for its bound deviceId
 */

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ServerConfig } from '../config.js';

export type PrincipalRole = 'viewer' | 'dispatcher' | 'device';

export interface AuthenticatedPrincipal {
  actorId: string;
  role: PrincipalRole;
  deviceId?: string;
}

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
      correlationId: string;
    }
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function resolvePrincipal(req: Request, config: ServerConfig): AuthenticatedPrincipal | null {
  const deviceHeader = req.header('X-Device-Token')?.trim();
  const authHeader = req.header('Authorization')?.trim();

  let bearerToken: string | undefined;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }

  // Check device token first if X-Device-Token is supplied, or via Bearer
  const candidateDeviceToken = deviceHeader || bearerToken;
  if (candidateDeviceToken) {
    for (const [configuredToken, deviceId] of Object.entries(config.deviceTokens)) {
      if (timingSafeEqualString(candidateDeviceToken, configuredToken)) {
        return {
          actorId: deviceId,
          role: 'device',
          deviceId,
        };
      }
    }
  }

  if (bearerToken) {
    if (timingSafeEqualString(bearerToken, config.dispatcherToken)) {
      return {
        actorId: 'dispatcher-baku-01',
        role: 'dispatcher',
      };
    }
    if (timingSafeEqualString(bearerToken, config.viewerToken)) {
      return {
        actorId: 'viewer-analyst-01',
        role: 'viewer',
      };
    }
  }

  return null;
}

export function requireAuth(config: ServerConfig, allowedRoles: PrincipalRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = resolvePrincipal(req, config);
    if (!principal) {
      res.status(401).json({
        error_code: 'UNAUTHORIZED',
        message: 'Authentication required: supply valid Bearer token or X-Device-Token',
        correlation_id: req.correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!allowedRoles.includes(principal.role)) {
      res.status(403).json({
        error_code: 'FORBIDDEN',
        message: `Role '${principal.role}' is not permitted to access ${req.method} ${req.path}`,
        correlation_id: req.correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.principal = principal;
    next();
  };
}
