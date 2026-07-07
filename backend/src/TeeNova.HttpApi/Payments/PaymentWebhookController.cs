using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;
using TeeNova.Payments;

namespace TeeNova.Webhooks;

/// <summary>
/// Receives raw webhook events from online payment providers.
/// No authentication — providers post directly without session tokens.
/// Raw body and headers are forwarded verbatim to the provider implementation for signature verification.
/// </summary>
[ApiController]
[Route("api/payment-webhooks")]
[AllowAnonymous]
public class PaymentWebhookController : TeeNovaControllerBase
{
    private readonly IOnlinePaymentWebhookAppService  _webhookService;
    private readonly ILogger<PaymentWebhookController> _logger;

    // Anonymous webhook body cap (Jira 9805). Replaces the former [DisableRequestSizeLimit], which
    // let an unauthenticated caller post an unbounded body. 1 MB comfortably covers real Stripe
    // webhook events (a few KB in practice, well under 100 KB even with expanded objects) while
    // rejecting oversized bodies before any raw-body read, signature verification, or business
    // logic runs. This is a per-action limit only — it does not touch the design upload endpoint
    // (FileController, 20 MB), whose own limit/rules are owned by Jira 9808.
    private const long MaxWebhookBodyBytes = 1024 * 1024;

    public PaymentWebhookController(
        IOnlinePaymentWebhookAppService    webhookService,
        ILogger<PaymentWebhookController>  logger)
    {
        _webhookService = webhookService;
        _logger         = logger;
    }

    /// <summary>
    /// Handles an incoming provider webhook event.
    /// provider: stripe | windcave | poli | paypal
    /// </summary>
    // Very generous per-IP cap (Jira 9808) — sized so a legitimate Stripe retry burst is never
    // throttled; signature verification + the 1 MB body cap remain the real webhook guards.
    [HttpPost("{provider}")]
    [EnableRateLimiting("PaymentWebhookPolicy")]
    [RequestSizeLimit(MaxWebhookBodyBytes)]
    public async Task<IActionResult> HandleWebhookAsync(string provider, CancellationToken cancellationToken)
    {
        // Read the raw body exactly once with explicit UTF-8 decoding (BOM detection disabled) so the
        // string handed to the provider is a faithful decode of the bytes the provider signed. No JSON
        // model binding runs before this: the provider verifies the signature over this raw payload
        // before any event content is trusted (see StripeOnlinePaymentProvider.ParseWebhookAsync).
        using var reader = new StreamReader(
            Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync(cancellationToken);

        IReadOnlyDictionary<string, string> headers = Request.Headers
            .ToDictionary(h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase);

        _logger.LogDebug("[Webhook] Received '{Provider}' webhook ({Bytes} bytes).", provider, rawBody.Length);

        // HTTP/retry policy (Jira 9806):
        //  • Unverified/unsupported/duplicate events are acknowledged inside the app service and return 200.
        //  • Known business rejections (amount mismatch, cancelled order, completed-after-cancel, …) are now
        //    durably recorded as PaymentWebhookEvent (RequiresManualReview / Rejected) and return 200, so a
        //    real provider does not retry an event whose local outcome will not change.
        //  • Only a genuine infrastructure failure (DB unavailable, etc.) throws out of the app service. It is
        //    left to propagate so ABP returns a non-2xx and the provider retries; the durable event record, if
        //    already written, is non-terminal so the retry safely re-attempts.
        await _webhookService.HandleWebhookAsync(provider, rawBody, headers, cancellationToken);
        return Ok();
    }
}
