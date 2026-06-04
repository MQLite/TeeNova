using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using TeeNova.Payments;
using Volo.Abp;

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

    // These error codes represent known business rejections that have been safely evaluated
    // and will not change on retry. Returning HTTP 200 prevents real payment providers
    // from entering indefinite retry loops for events that cannot be processed.
    private static readonly HashSet<string> KnownWebhookRejectionCodes = new(StringComparer.Ordinal)
    {
        "TeeNova:Payment:WebhookMissingProviderSessionId",
        "TeeNova:Payment:WebhookSessionNotFound",
        "TeeNova:Payment:WebhookSessionNotActionable",
        "TeeNova:Payment:WebhookMissingAmount",
        "TeeNova:Payment:WebhookAmountMismatch",
        "TeeNova:Payment:WebhookCurrencyMismatch",
        "TeeNova:Payment:WebhookOrderNotFound",
        "TeeNova:Payment:WebhookOrderCancelled",
        "TeeNova:Payment:WebhookOrderCompleted",
        "TeeNova:Payment:WebhookNoBalanceDue",
        "TeeNova:Payment:WebhookOverpayment",
    };

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
    [HttpPost("{provider}")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> HandleWebhookAsync(string provider, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var rawBody = await reader.ReadToEndAsync(cancellationToken);

        IReadOnlyDictionary<string, string> headers = Request.Headers
            .ToDictionary(h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase);

        try
        {
            await _webhookService.HandleWebhookAsync(provider, rawBody, headers, cancellationToken);
            return Ok();
        }
        catch (BusinessException ex) when (ex.Code != null && KnownWebhookRejectionCodes.Contains(ex.Code))
        {
            // The app service already logged the diagnostic detail. Log here only to confirm
            // the rejection was handled at the HTTP boundary without a 500.
            _logger.LogInformation(
                "[Webhook] Provider '{Provider}' webhook rejected (non-retryable): {Code} — returning 200 to suppress provider retry.",
                provider, ex.Code);

            return Ok(new { rejected = true, reason = ex.Code });
        }
    }
}
