/* ==========================================================================
   APP07 - /api/session
   Returns ONLY minimal role, employee and display state for the logged-in
   user. No email, no subject, no issuer, no task data, no credentials.
   Protected by the default-deny middleware.
   ========================================================================== */

export async function onRequestGet(context) {
    const user = context.data && context.data.user;
    if (!user) {
        return new Response(JSON.stringify({ error: "auth_failed", message: "Authentication failed" }), {
            status: 401,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    }

    // Redacted session payload: role + employee code + display name only.
    const body = {
        authenticated: true,
        role: user.role,
        employee_code: user.employee_code,
        display_name: user.display_name
    };

    return new Response(JSON.stringify(body), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}
