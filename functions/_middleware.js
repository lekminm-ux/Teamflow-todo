/* ==========================================================================
   APP07 - PAGES FUNCTION MIDDLEWARE (default-deny identity gate)
   Runs before every /api/* function. Requests are only forwarded once the
   Access JWT is verified and mapped to an active application user.
   ========================================================================== */

import { authenticate, AuthError, jsonError } from "./_lib/authorization.js";

export async function onRequest(context) {
    const { request } = context;

    // Never allow identity gates to be bypassed by preflight-only handling.
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
                "Access-Control-Max-Age": "86400"
            }
        });
    }

    let user;
    try {
        user = await authenticate(context);
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonError(err.code, err.message, err.status);
        }
        return jsonError("auth_failed", "Authentication failed", 401);
    }

    // Attach the minimal verified user to the context for downstream handlers.
    context.data = context.data || {};
    context.data.user = user;

    return context.next();
}
