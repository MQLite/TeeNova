using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    private readonly IOnlinePaymentWebhookAppService _webhookService;

    public PaymentWebhookController(IOnlinePaymentWebhookAppService webhookService)
    {
        _webhookService = webhookService;
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

        await _webhookService.HandleWebhookAsync(provider, rawBody, headers, cancellationToken);

        return Ok();
    }
}
