/* ==========================================================================
   APP07 - IDENTITY & AUTHORIZATION LIBRARY
   Cloudflare Access (Google login) Pages Plugin design.

   Security model:
   - Identity is trusted ONLY after the Cf-Access-Jwt-Assertion token passes
     signature (RS256, Cloudflare Access certs), issuer, audience and expiry
     validation.
   - The verified issuer + subject pair is mapped to an ACTIVE app_users row.
     Default deny: no row, inactive row, or missing configuration = no access.
   - Email is informational only and is never used for authorization or for
     display-name guessing.
   - All configuration is runtime, non-secret, and provided as placeholders in
     wrangler.toml [vars]. No real domain, audience, credential or user data
     is embedded in this file.
   ========================================================================== */

const ENCODER = new TextEncoder();

// APP07 is intentionally capped at the Cloudflare Zero Trust Free allowance.
// Raising this value requires explicit owner approval and a Cloudflare plan /
// billing review before the code is changed.
export const MAX_ACTIVE_APP_USERS = 50;

export class AuthError extends Error {
    constructor(code, message, status = 401) {
        super(message);
        this.name = "AuthError";
        this.code = code;
        this.status = status;
    }
}

/* ---------- response helper ---------- */

export function jsonError(code, message, status = 401) {
    return new Response(JSON.stringify({ error: code, message }), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

/* ---------- base64url helpers ---------- */

function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64UrlJson(value) {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

/* ---------- runtime configuration (non-secret, fail closed) ---------- */

function getRequiredConfig(env, key) {
    const value = env ? env[key] : undefined;
    if (typeof value !== "string" || value.length === 0 || value.indexOf("REPLACE_WITH_") === 0) {
        throw new AuthError(
            "config_missing",
            `Runtime configuration placeholder for ${key} is not set; denying by default`,
            500
        );
    }
    return value;
}

/* ---------- Cloudflare Access public certs ---------- */

async function loadAccessCerts(env, fetchImpl) {
    // Test / runtime injection of the PUBLIC cert set only (never a secret).
    if (env && typeof env.ACCESS_CERTS_JSON === "string" && env.ACCESS_CERTS_JSON.length > 0) {
        return JSON.parse(env.ACCESS_CERTS_JSON);
    }
    const domain = getRequiredConfig(env, "ACCESS_TEAM_DOMAIN");
    const response = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
    if (!response.ok) {
        throw new AuthError("certs_unavailable", "Unable to load Cloudflare Access public certs", 500);
    }
    return response.json();
}

/* ---------- Access JWT verification ---------- */

/**
 * Verifies a Cloudflare Access JWT end-to-end.
 * Returns the verified payload (iss, sub, aud, exp, email as informational).
 * Throws AuthError with a specific code on any failure (default deny).
 */
export async function verifyAccessToken(token, env, fetchImpl) {
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof token !== "string" || token.length === 0) {
        throw new AuthError("missing_token", "Access JWT is missing", 401);
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new AuthError("invalid_token", "Access JWT is malformed", 401);
    }

    let header;
    try {
        header = base64UrlJson(parts[0]);
    } catch (err) {
        throw new AuthError("invalid_token", "Access JWT header is unreadable", 401);
    }
    if (!header || header.alg !== "RS256") {
        throw new AuthError("invalid_token", "Access JWT algorithm is not supported", 401);
    }

    const certs = await loadAccessCerts(env, doFetch);
    const jwk = certs && Array.isArray(certs.keys)
        ? certs.keys.find((key) => key && key.kid === header.kid)
        : null;
    if (!jwk) {
        throw new AuthError("unknown_kid", "Access JWT signing key is not trusted", 401);
    }

    const cryptoApi = globalThis.crypto;
    const key = await cryptoApi.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
    );
    const signatureValid = await cryptoApi.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        key,
        base64UrlDecode(parts[2]),
        ENCODER.encode(`${parts[0]}.${parts[1]}`)
    );
    if (!signatureValid) {
        throw new AuthError("invalid_signature", "Access JWT signature verification failed", 401);
    }

    let payload;
    try {
        payload = base64UrlJson(parts[1]);
    } catch (err) {
        throw new AuthError("invalid_token", "Access JWT payload is unreadable", 401);
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== "number" || payload.exp <= now) {
        throw new AuthError("expired_token", "Access JWT is expired", 401);
    }

    const domain = getRequiredConfig(env, "ACCESS_TEAM_DOMAIN");
    if (payload.iss !== `https://${domain}`) {
        throw new AuthError("invalid_issuer", "Access JWT issuer is not trusted", 401);
    }

    const audience = getRequiredConfig(env, "ACCESS_AUDIENCE");
    const audienceList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audienceList.includes(audience)) {
        throw new AuthError("invalid_audience", "Access JWT audience is not trusted", 401);
    }

    return payload;
}

/* ---------- identity resolution (stable issuer + subject -> app_users) ---------- */

async function listAllowedActiveUsers(db) {
    const { results } = await db
        .prepare(
            "SELECT issuer, subject, role, employee_code, display_name " +
            "FROM app_users WHERE is_active = 1 " +
            "ORDER BY created_at ASC, issuer ASC, subject ASC LIMIT ?"
        )
        .bind(MAX_ACTIVE_APP_USERS)
        .all();

    // Keep the limit in application code as a second guard in case a test
    // double or future database adapter does not enforce SQL LIMIT correctly.
    return Array.isArray(results) ? results.slice(0, MAX_ACTIVE_APP_USERS) : [];
}

/**
 * Maps a verified issuer+subject to an ACTIVE app_users row.
 * Default deny: returns null for unregistered or inactive identities.
 * Email is intentionally not selected or used.
 */
export async function resolveActiveUser(db, issuer, subject) {
    const allowedUsers = await listAllowedActiveUsers(db);
    const row = allowedUsers.find((candidate) => (
        candidate.issuer === issuer && candidate.subject === subject
    ));
    if (!row) {
        const activeButOverLimit = await db
            .prepare(
                "SELECT 1 AS active FROM app_users WHERE issuer = ? AND subject = ? AND is_active = 1"
            )
            .bind(issuer, subject)
            .first();
        if (activeButOverLimit) {
            throw new AuthError(
                "user_limit_exceeded",
                "APP07 supports at most 50 active users; owner approval is required before increasing the limit",
                403
            );
        }
        return null;
    }
    return {
        role: row.role === "supervisor" ? "supervisor" : "member",
        employee_code: row.employee_code || null,
        display_name: row.display_name || null,
        issuer,
        subject
    };
}

/**
 * Resolves a task assignee only when the employee belongs to one of the same
 * 50 allowed active application users. This prevents supervisors from
 * assigning work to an over-limit identity that cannot enter the app.
 */
export async function resolveAllowedAssigneeOwner(db, employeeCode) {
    if (typeof employeeCode !== "string" || employeeCode.trim().length === 0) {
        return null;
    }
    const allowedUsers = await listAllowedActiveUsers(db);
    const row = allowedUsers.find((candidate) => candidate.employee_code === employeeCode.trim());
    return row ? { issuer: row.issuer, subject: row.subject } : null;
}

/* ---------- request authentication ---------- */

/**
 * Authenticates a Pages Function request context.
 * Reads the Cf-Access-Jwt-Assertion header, verifies the JWT, resolves the
 * active application user, and returns the minimal user object.
 */
export async function authenticate(context) {
    const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
    let payload;
    try {
        payload = await verifyAccessToken(token, context.env, context.env && context.env.ACCESS_FETCH_IMPL);
    } catch (err) {
        if (err instanceof AuthError) {
            throw err;
        }
        throw new AuthError("invalid_token", "Access JWT verification failed", 401);
    }

    const user = await resolveActiveUser(context.env.DB, payload.iss, payload.sub);
    if (!user) {
        throw new AuthError(
            "user_not_authorized",
            "Verified identity is not mapped to an active application user",
            403
        );
    }
    return user;
}

/* ---------- authorization helpers ---------- */

export function isSupervisor(user) {
    return Boolean(user) && user.role === "supervisor";
}

/**
 * Ownership check for a task row:
 * - Supervisors may act on any task (including legacy rows with NULL owner).
 * - Members may only act on tasks they own (issuer + subject must match).
 * - Legacy rows (NULL ownership) stay supervisor-only.
 */
export function canModifyTask(user, taskRow) {
    if (!user || !taskRow) return false;
    if (isSupervisor(user)) return true;
    return (
        taskRow.owner_user_issuer === user.issuer &&
        taskRow.owner_user_subject === user.subject
    );
}
